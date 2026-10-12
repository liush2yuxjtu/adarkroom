/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function () {
  "use strict";

  var game;
  var events = {};
  var config = {};
  var lastRender = 0;
  var lastViewSig = "";
  var eventKey = "";
  var uiStyle = "text";
  var lastLoc = "";
  var STYLE_KEY = "adr.style";
  var PX_ICON = {
    fire: "stoke", gather: "gather", traps: "trap",
    "build-trap": "trap", "build-cart": "cart", "build-hut": "hut",
    north: "north", west: "west", east: "east", south: "south",
    embark: "embark", punch: "punch", flee: "flee"
  };

  function $(id) { return document.getElementById(id); }

  function isPixel() { return uiStyle === "pixel"; }

  function persistStyle(style) {
    try { localStorage.setItem(STYLE_KEY, style); } catch (e) { /* ignore */ }
  }

  function resolveStyle(cfg) {
    var q = new URLSearchParams(location.search);
    var fromUrl = (q.get("style") || "").toLowerCase();
    if (fromUrl === "pixel" || fromUrl === "text") {
      persistStyle(fromUrl);
      return fromUrl;
    }
    try {
      var saved = localStorage.getItem(STYLE_KEY);
      if (saved === "pixel" || saved === "text") return saved;
    } catch (e) { /* ignore */ }
    if (cfg && (cfg.style === "pixel" || cfg.style === "text")) return cfg.style;
    return "text";
  }

  function applyStyle(style) {
    uiStyle = style === "pixel" ? "pixel" : "text";
    document.documentElement.setAttribute("data-style", uiStyle);
    document.body.classList.toggle("style-pixel", uiStyle === "pixel");
    document.body.classList.toggle("style-text", uiStyle === "text");
  }

  function pxIconEl(name) {
    var s = document.createElement("span");
    s.className = "px-icon px-" + name;
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function stackCount(n) {
    if (n <= 0) return 0;
    if (n <= 4) return n;
    if (n <= 12) return 4;
    return 5;
  }

  function woodpileFrame(n) {
    if (n <= 0) return 0;
    if (n <= 4) return 1;
    if (n <= 12) return 2;
    if (n <= 30) return 3;
    return 4;
  }

  function cueForNote(text) {
    text = String(text || "");
    if (/火|柴|烧|火堆|火光/.test(text)) return "fire";
    if (/木|林|枝/.test(text)) return "wood";
    if (/陌生|建造|人|流浪/.test(text)) return "person";
    if (/风|寒|冷/.test(text)) return "wind";
    if (/陷阱/.test(text)) return "trap";
    if (/肉|毛皮/.test(text)) return "meat";
    if (/罗盘/.test(text)) return "compass";
    if (/兽|野兽/.test(text)) return "beast";
    if (/声|噪/.test(text)) return "sound";
    if (/游牧|贸易/.test(text)) return "trade";
    return "spark";
  }

  function eventIcon(id) {
    id = String(id || "");
    if (/stranger|builder/.test(id)) return "person";
    if (/nomad/.test(id)) return "trade";
    if (/noise/.test(id)) return "sound";
    if (/compass/.test(id)) return "compass";
    if (/trap/.test(id)) return "trap";
    if (/beast|combat/.test(id)) return "beast";
    return "spark";
  }

  function stokeFrame(ratio, fire) {
    if (ratio <= 0) {
      if (fire <= 0) return 10;
      return Math.floor(Date.now() / 180) % 3;
    }
    if (ratio > 0.78) return Math.floor(Date.now() / 160) % 3;
    if (ratio > 0.58) return 3;
    if (ratio > 0.42) return 4;
    if (ratio > 0.30) return 5;
    if (ratio > 0.20) return 6;
    if (ratio > 0.12) return 7;
    if (ratio > 0.06) return 8;
    return 9;
  }

  function hearthFrame(fire) {
    if (fire <= 0) return 10;
    if (fire === 1) return 11;
    if (fire === 2) return 3 + (Math.floor(Date.now() / 220) % 2);
    if (fire === 3) return Math.floor(Date.now() / 180) % 3;
    return 12;
  }

  function skyIndex(state) {
    var t = Math.floor((state.game_time_sec || 0) / 300) % 4;
    return t;
  }

  function ensureScene(panel, kind) {
    var sc = panel.querySelector(".px-scene");
    if (sc) {
      sc.className = "px-scene px-scene-" + kind;
      return sc;
    }
    sc = document.createElement("div");
    sc.className = "px-scene px-scene-" + kind;
    sc.innerHTML =
      '<div class="px-sky" aria-hidden="true"></div>' +
      '<div class="px-bg" aria-hidden="true"></div>' +
      '<div class="px-hearth" aria-hidden="true"><span class="px-fire"></span><span class="px-smoke"></span><span class="px-cracks"></span></div>' +
      '<div class="px-woodpile" aria-hidden="true"></div>' +
      '<div class="px-animal" aria-hidden="true"></div>' +
      '<div class="px-cues"><span class="px-temp px-icon"></span></div>' +
      '<div class="px-builder px-icon px-person" aria-hidden="true"></div>';
    var title = panel.querySelector(".title");
    if (title) panel.insertBefore(sc, title);
    else panel.insertBefore(sc, panel.firstChild);
    return sc;
  }

  function paintAmbient() {
    if (!isPixel() || !game) return;
    var loc = game.state.location;
    var kind = loc === "outside" ? "outside" : loc === "world" ? "world" : loc;
    var panel = loc === "outside" ? $("panel-outside") : loc === "path" || loc === "world" ? $("panel-path") : $("panel-room");
    if (!panel) return;
    var sc = panel.querySelector(".px-scene");
    if (!sc) return;
    var fireEl = sc.querySelector(".px-fire");
    if (fireEl) {
      var hf = hearthFrame(game.state.fire);
      fireEl.style.backgroundPosition = "-" + (hf * 128) + "px 0";
      fireEl.classList.toggle("lit", game.state.fire >= 3);
    }
    var sky = sc.querySelector(".px-sky");
    if (sky) sky.style.backgroundPosition = "-" + (skyIndex(game.state) * 640) + "px 0";
    var pile = sc.querySelector(".px-woodpile");
    if (pile) pile.style.backgroundPosition = "-" + (woodpileFrame(game.state.stores.wood || 0) * 64) + "px 0";
    var hot = game.state.temperature >= 4 || game.state.fire >= 4;
    sc.classList.toggle("overheat", hot);
    var smoke = sc.querySelector(".px-smoke");
    if (smoke && hot) smoke.style.backgroundPosition = "-" + ((Math.floor(Date.now() / 220) % 3) * 64) + "px 0";
    var temp = sc.querySelector(".px-temp");
    if (temp) {
      temp.className = "px-temp px-icon " + (game.state.temperature <= 1 ? "px-cold" : game.state.temperature >= 3 ? "px-hot" : "px-spark");
    }
    var builder = sc.querySelector(".px-builder");
    if (builder) builder.classList.toggle("show", game.state.builder_level >= 1 && game.state.builder_level < 4);
    var animal = sc.querySelector(".px-animal");
    if (animal && (kind === "outside" || kind === "forest")) animal.classList.add("walk");
  }

  function playPhaseWipe(loc) {
    if (!isPixel()) { lastLoc = loc; return; }
    if (loc === lastLoc) return;
    lastLoc = loc;
    var el = $("phase-wipe");
    if (!el) return;
    el.hidden = false;
    el.className = "show";
    setTimeout(function () {
      el.className = "";
      el.hidden = true;
    }, 480);
  }

  function cdLeft(id) {
    return game.state.cooldowns[id] || 0;
  }

  function cdRatio(id) {
    var left = cdLeft(id);
    // @pacing kind=cooldown id=stoke value=10s phase=room_fire
    var STOKE_CD = 10;
    // @pacing kind=cooldown id=gather value=60s phase=forest
    var GATHER_CD = 60;
    // @pacing kind=cooldown id=traps value=90s phase=forest
    var TRAPS_CD = 90;
    var max = { stoke: STOKE_CD, gather: GATHER_CD, traps: TRAPS_CD }[id] || 1;
    return left > 0 ? left / max : 0;
  }

  function paintCdBar(b, cdId) {
    var barEl = b.querySelector(".cd");
    var secEl = b.querySelector(".cd-sec");
    var left = cdId ? cdLeft(cdId) : 0;
    if (isPixel()) {
      if (secEl) secEl.textContent = "";
      if (cdId === "stoke") {
        var flame = b.querySelector(".px-flame");
        if (flame && game) {
          var fr = stokeFrame(cdRatio("stoke"), game.state.fire);
          flame.style.backgroundPosition = "-" + (fr * 64) + "px 0";
          flame.classList.toggle("ready", left <= 0);
        }
        if (barEl) barEl.style.width = "0%";
        return;
      }
      if (barEl) barEl.style.width = cdId ? (cdRatio(cdId) * 100) + "%" : "0%";
      return;
    }
    if (barEl) barEl.style.width = cdId ? (cdRatio(cdId) * 100) + "%" : "0%";
    if (secEl) secEl.textContent = left > 0 ? String(Math.ceil(left)) : "";
  }

  function upsertButton(parent, key, spec) {
    var b = parent.querySelector('[data-key="' + key + '"]');
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "adr";
      b.dataset.key = key;
      var lab = document.createElement("span");
      lab.className = "btn-label";
      b.appendChild(lab);
      var sec = document.createElement("span");
      sec.className = "cd-sec";
      sec.setAttribute("aria-hidden", "true");
      b.appendChild(sec);
      var bar = document.createElement("span");
      bar.className = "cd";
      b.appendChild(bar);
      b.addEventListener("click", spec.onClick);
      parent.appendChild(b);
    }
    if (!b.querySelector(".cd-sec")) {
      var injected = document.createElement("span");
      injected.className = "cd-sec";
      injected.setAttribute("aria-hidden", "true");
      var existingLab = b.querySelector(".btn-label");
      if (existingLab) existingLab.insertAdjacentElement("afterend", injected);
      else b.appendChild(injected);
    }
    var labEl = b.querySelector(".btn-label");
    if (isPixel()) {
      var icon = spec.icon || PX_ICON[key] || "spark";
      if (key.indexOf("ev-") === 0) {
        if (/ignore|goodbye|flee/.test(key)) icon = "no";
        else if (/wait|back|home|take/.test(key)) icon = "ok";
        else if (spec.costIcon) icon = spec.costIcon;
        else icon = "ok";
      }
      b.setAttribute("aria-label", spec.label || key);
      b.classList.add("px-btn");
      if (key === "fire") {
        b.classList.add("px-stoke");
        if (!labEl.querySelector(".px-flame")) {
          labEl.textContent = "";
          var fl = document.createElement("span");
          fl.className = "px-flame";
          labEl.appendChild(fl);
        }
      } else if (!labEl.querySelector(".px-icon")) {
        labEl.textContent = "";
        labEl.appendChild(pxIconEl(icon));
      } else {
        labEl.querySelector(".px-icon").className = "px-icon px-" + icon;
      }
    } else if (labEl.textContent !== spec.label) {
      labEl.textContent = spec.label;
    }
    var onCd = !!(spec.cdId && cdLeft(spec.cdId) > 0);
    var disabled = !!spec.disabled || onCd;
    if (b.disabled !== disabled) b.disabled = disabled;
    paintCdBar(b, spec.cdId);
    return b;
  }

  function keepButtons(parent, keys) {
    [].slice.call(parent.querySelectorAll("button.adr")).forEach(function (b) {
      if (keys.indexOf(b.dataset.key) < 0) b.remove();
    });
  }

  function paintCooldowns() {
    if (!game) return;
    document.querySelectorAll("button.adr[data-key]").forEach(function (b) {
      var key = b.dataset.key;
      var cdId = key === "fire" ? "stoke" : key === "gather" ? "gather" : key === "traps" ? "traps" : "";
      if (!cdId) return;
      paintCdBar(b, cdId);
      var onCd = cdLeft(cdId) > 0;
      if (onCd) b.disabled = true;
      else if (cdId === "stoke" || cdId === "gather" || cdId === "traps") b.disabled = false;
    });
    paintAmbient();
  }

  function renderHeader() {
    var h = $("header");
    var tabs = [
      { id: "room", label: ADR.roomTitle(game.state) },
      { id: "outside", label: game.state.unlocked.outside ? ADR.hutTitle(game.state.buildings.hut) : ADR.t("Outside") },
      { id: "path", label: ADR.t("A Dusty Path") }
    ];
    tabs.forEach(function (tab) {
      var b = h.querySelector('[data-tab="' + tab.id + '"]');
      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.dataset.tab = tab.id;
        b.addEventListener("click", function () {
          if (game.state.world.on_expedition) return;
          game.act("travel", { area: tab.id });
        });
        h.appendChild(b);
      }
      if (isPixel()) {
        var iconName = tab.id === "outside" ? "forest" : tab.id === "path" ? "path" : "room";
        b.setAttribute("aria-label", tab.label);
        if (!b.querySelector(".px-icon")) {
          b.textContent = "";
          b.appendChild(pxIconEl(iconName));
        }
      } else if (b.textContent !== tab.label) {
        b.textContent = tab.label;
      }
      var locked = !game.state.unlocked[tab.id] && tab.id !== "room";
      b.disabled = locked;
      var active = game.state.location === tab.id || (tab.id === "path" && game.state.location === "world");
      b.className = (active ? "active" : "") + (isPixel() ? " px-tab" : "");
    });
  }

  function renderNotes() {
    var box = $("notifications");
    var want = game.state.notifications.slice(0, 16).map(function (n) {
      return isPixel() ? cueForNote(n.text) : n.text;
    });
    var have = [].slice.call(box.querySelectorAll(".note")).map(function (n) {
      return isPixel() ? n.dataset.cue : n.textContent;
    });
    if (want.join("\n") === have.join("\n")) return;
    box.innerHTML = "";
    want.forEach(function (text) {
      var d = document.createElement("div");
      d.className = "note";
      if (isPixel()) {
        d.dataset.cue = text;
        d.setAttribute("aria-label", text);
        d.appendChild(pxIconEl(text));
      } else {
        d.textContent = text;
      }
      box.appendChild(d);
    });
  }

  function renderStores() {
    var box = $("stores");
    var any = game.state.wood_initialized || Object.keys(game.state.stores).some(function (k) {
      return game.state.stores[k] > 0;
    });
    if (!any) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    var html;
    if (isPixel()) {
      html = '<div class="legend px-icon px-stores" aria-label="' + ADR.t("stores") + '"></div>';
      ADR.ITEMS.forEach(function (k) {
        var n = game.state.stores[k] || 0;
        if (n <= 0 && k !== "wood") return;
        if (k === "wood" && !game.state.wood_initialized) return;
        var icon = k === "cured_meat" ? "cured_meat" : k;
        html += '<div class="store-row" aria-label="' + (ADR.ITEM_CN[k] || k) + '"><div class="px-stack">';
        var count = stackCount(n);
        var i;
        for (i = 0; i < count; i++) html += '<span class="px-icon px-' + icon + '"></span>';
        html += "</div></div>";
      });
      if (game.state.buildings.hut > 0 || game.state.population > 0) {
        html += '<div class="store-row" aria-label="pop"><div class="px-stack">';
        var p;
        for (p = 0; p < stackCount(game.state.population); p++) html += '<span class="px-icon px-pop"></span>';
        html += "</div></div>";
      }
    } else {
      html = '<div class="legend">' + ADR.t("stores") + "</div>";
      ADR.ITEMS.forEach(function (k) {
        var n = game.state.stores[k] || 0;
        if (n <= 0 && k !== "wood") return;
        if (k === "wood" && !game.state.wood_initialized) return;
        html += '<div class="store-row"><span>' + (ADR.ITEM_CN[k] || k) + '</span><span class="n">' + n + "</span></div>";
      });
      if (game.state.buildings.hut > 0 || game.state.population > 0) {
        html += '<div class="store-row"><span>' + ADR.t("pop ") + '</span><span class="n">' + game.state.population + "</span></div>";
      }
    }
    if (box.dataset.html !== html) {
      box.innerHTML = html;
      box.dataset.html = html;
    }
  }

  function ensureScaffold(panelId, titleId, statusId, btnsId, hintId) {
    var p = $(panelId);
    if (p.dataset.ready) return p;
    p.innerHTML = "";
    var h = document.createElement("h1");
    h.className = "title";
    h.id = titleId;
    p.appendChild(h);
    var st = document.createElement("div");
    st.className = "status-line";
    st.id = statusId;
    p.appendChild(st);
    var col = document.createElement("div");
    col.className = "btn-col";
    col.id = btnsId;
    p.appendChild(col);
    if (hintId) {
      var hint = document.createElement("div");
      hint.className = "hint";
      hint.id = hintId;
      p.appendChild(hint);
    }
    if (isPixel()) {
      var kind = panelId === "panel-outside" ? "outside" : panelId === "panel-path" ? "path" : "room";
      ensureScene(p, kind);
    }
    p.dataset.ready = "1";
    return p;
  }

  function renderRoom() {
    ensureScaffold("panel-room", "room-title", "room-status", "room-btns", "room-hint");
    if (isPixel()) {
      $("room-title").textContent = "";
      $("room-title").setAttribute("aria-label", ADR.roomTitle(game.state));
      $("room-status").textContent = "";
      ensureScene($("panel-room"), "room");
    } else {
      $("room-title").textContent = ADR.roomTitle(game.state);
      $("room-status").innerHTML = "房间" + ADR.TEMP[game.state.temperature] + "<br>火堆" + ADR.FIRE[game.state.fire];
    }
    var keys = ["fire"];
    upsertButton($("room-btns"), "fire", {
      label: game.state.fire <= 0 ? ADR.t("light fire") : ADR.t("stoke fire"),
      icon: game.state.fire <= 0 ? "light" : "stoke",
      cdId: "stoke",
      onClick: function () {
        game.act(game.state.fire <= 0 ? "light_fire" : "stoke_fire");
      }
    });
    ADR.Game.prototype.visibleCrafts.call(game).forEach(function (c) {
      var name = { trap: "陷阱", cart: "货车", hut: "小屋" }[c.kind];
      var cost = Object.keys(c.cost).map(function (k) {
        return (ADR.ITEM_CN[k] || k) + c.cost[k];
      }).join(" ");
      keys.push("build-" + c.kind);
      upsertButton($("room-btns"), "build-" + c.kind, {
        label: name + " (" + cost + ")",
        icon: c.kind,
        disabled: !c.can,
        onClick: function () { game.act("build", { kind: c.kind }); }
      });
    });
    keepButtons($("room-btns"), keys);
    var hint = $("room-hint");
    if (game.state.builder_level >= 1 && game.state.builder_level < 4) {
      hint.textContent = isPixel() ? "" : "角落里有人。把屋子烧暖些。";
      hint.style.display = isPixel() ? "none" : "";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }

  function renderOutside() {
    ensureScaffold("panel-outside", "out-title", "out-status", "out-btns", "out-hint");
    if (isPixel()) {
      $("out-title").textContent = "";
      $("out-title").setAttribute("aria-label", ADR.hutTitle(game.state.buildings.hut));
      $("out-status").textContent = "";
      ensureScene($("panel-outside"), "outside");
    } else {
      $("out-title").textContent = ADR.hutTitle(game.state.buildings.hut);
      $("out-status").textContent = game.state.buildings.hut > 0
        ? ADR.t("the sky is grey and the wind blows relentlessly")
        : ADR.t("dry brush and dead branches litter the forest floor");
    }
    var keys = ["gather"];
    upsertButton($("out-btns"), "gather", {
      label: ADR.t("gather wood"),
      cdId: "gather",
      onClick: function () { game.act("gather_wood"); }
    });
    if (game.state.buildings.trap > 0) {
      keys.push("traps");
      upsertButton($("out-btns"), "traps", {
        label: ADR.t("check traps"),
        cdId: "traps",
        onClick: function () { game.act("check_traps"); }
      });
    }
    keepButtons($("out-btns"), keys);
    var hint = $("out-hint");
    if (game.state.population > 0 && !isPixel()) {
      hint.textContent = "伐木者 " + (game.state.workers.gatherer || 0) + " · " + ADR.t("pop ") + game.state.population;
      hint.style.display = "";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }

  function renderPath() {
    var p = $("panel-path");
    if (game.state.world.on_expedition) {
      if (p.dataset.mode !== "world") {
        p.innerHTML = "";
        p.dataset.ready = "";
        p.dataset.mode = "world";
        ensureScaffold("panel-path", "path-title", "path-status", "path-btns", "path-hint");
      }
      if (isPixel()) {
        $("path-title").textContent = "";
        $("path-status").textContent = "";
        ensureScene($("panel-path"), "world");
      } else {
        $("path-title").textContent = ADR.t("A Barren World");
        var s = game.state.world;
        $("path-status").textContent = "生命 " + s.hp + "/" + s.max_hp + "  ·  水 " + s.water + "  ·  肉 " + ((game.state.outfit.meat || 0) + (game.state.outfit.cured_meat || 0));
      }
      var s = game.state.world;
      var map = $("world-map");
      if (!map) {
        map = document.createElement("div");
        map.id = "world-map";
        $("path-status").insertAdjacentElement("afterend", map);
      }
      if (isPixel()) {
        var tiles = [];
        var y;
        for (y = 0; y < s.size; y++) {
          var x;
          for (x = 0; x < s.size; x++) {
            var cls = "t-void";
            if (x === s.x && y === s.y) cls = "t-player";
            else if (s.landmarks[x + "," + y]) cls = "t-house";
            else if (s.visited[x + "," + y]) {
              var ter = ADR.terrainAt(x, y, s.size);
              cls = ter === "village" ? "t-village" : ter === "forest" ? "t-forest" : ter === "grass" ? "t-grass" : "t-sand";
            }
            tiles.push('<span class="px-tile ' + cls + '"></span>');
          }
        }
        map.style.gridTemplateColumns = "repeat(" + s.size + ", 16px)";
        map.innerHTML = tiles.join("");
      } else {
        var lines = [];
        for (var y = 0; y < s.size; y++) {
          var row = "";
          for (var x = 0; x < s.size; x++) {
            if (x === s.x && y === s.y) row += "@";
            else if (s.landmarks[x + "," + y]) row += "H";
            else if (!s.visited[x + "," + y]) row += " ";
            else {
              var ter = ADR.terrainAt(x, y, s.size);
              row += ter === "village" ? "A" : ter === "forest" ? "#" : ter === "grass" ? "," : ".";
            }
          }
          lines.push(row);
        }
        map.textContent = lines.join("\n");
      }
      var dirs = [["north", "北", 0, -1], ["west", "西", -1, 0], ["east", "东", 1, 0], ["south", "南", 0, 1]];
      dirs.forEach(function (d) {
        upsertButton($("path-btns"), d[0], {
          label: d[1],
          onClick: function () { game.act("world_move", { dx: d[2], dy: d[3] }); }
        });
      });
      keepButtons($("path-btns"), ["north", "west", "east", "south"]);
      $("path-hint").textContent = isPixel() ? "" : "WASD 或方向键移动。H 是旧房子，A 是村落。";
      return;
    }
    if (p.dataset.mode !== "path") {
      p.innerHTML = "";
      p.dataset.ready = "";
      p.dataset.mode = "path";
      ensureScaffold("panel-path", "path-title", "path-status", "path-btns", "path-hint");
      var extra = document.createElement("div");
      extra.id = "path-extra";
      $("path-status").insertAdjacentElement("afterend", extra);
    }
    if (isPixel()) {
      $("path-title").textContent = "";
      $("path-status").textContent = "";
      ensureScene($("panel-path"), "path");
    } else {
      $("path-title").textContent = ADR.t("A Dusty Path");
      $("path-status").textContent = ADR.t("the compass points east");
    }
    var extraBox = $("path-extra");
    extraBox.innerHTML = "";
    if (game.state.slice_complete) {
      var ban = document.createElement("div");
      ban.id = "slice-banner";
      ban.className = "show";
      if (isPixel()) {
        ban.setAttribute("aria-label", "slice complete");
        ban.appendChild(pxIconEl("ok"));
      } else {
        ban.textContent = "尘途的第一段已经走完。你可以继续在林中经营，或导出这次试玩的遥测。";
      }
      extraBox.appendChild(ban);
    }
    var supplies = document.createElement("div");
    if (isPixel()) supplies.appendChild(pxIconEl("stores"));
    else supplies.textContent = ADR.t("supplies:");
    extraBox.appendChild(supplies);
    ["meat", "cured_meat", "fur"].forEach(function (item) {
      var row = document.createElement("div");
      row.className = "pack-row";
      var have = game.state.stores[item] || 0;
      var packed = game.state.outfit[item] || 0;
      if (isPixel()) {
        var stack = document.createElement("div");
        stack.className = "px-stack";
        var i;
        for (i = 0; i < stackCount(packed || have); i++) stack.appendChild(pxIconEl(item));
        row.appendChild(stack);
      } else {
        row.innerHTML = "<span>" + (ADR.ITEM_CN[item] || item) + " 库存" + have + " / 行装" + packed + "</span>";
      }
      var minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = isPixel() ? "" : "−";
      if (isPixel()) { minus.appendChild(pxIconEl("minus")); minus.setAttribute("aria-label", "minus"); }
      minus.addEventListener("click", function () { game.act("pack", { item: item, amount: -1 }); });
      var plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = isPixel() ? "" : "+";
      if (isPixel()) { plus.appendChild(pxIconEl("plus")); plus.setAttribute("aria-label", "plus"); }
      plus.addEventListener("click", function () { game.act("pack", { item: item, amount: 1 }); });
      row.appendChild(minus);
      row.appendChild(plus);
      extraBox.appendChild(row);
    });
    var food = (game.state.outfit.meat || 0) + (game.state.outfit.cured_meat || 0);
    upsertButton($("path-btns"), "embark", {
      label: ADR.t("embark"),
      disabled: food <= 0,
      onClick: function () { game.act("embark"); }
    });
    keepButtons($("path-btns"), ["embark"]);
    $("path-hint").textContent = isPixel() ? "" : "带上肉再出发。向东北走，能看见一座旧房子。回到村子格子即可回家。";
  }

  function renderEvent() {
    var ov = $("overlay");
    var ev = game.state.active_event;
    var combat = game.state.combat;
    if (!ev && !combat) {
      if (ov.dataset.mode === "settings") return;
      if (ov.dataset.mode) {
        ov.className = "";
        ov.innerHTML = "";
        ov.dataset.mode = "";
        ov.dataset.eventKey = "";
      }
      eventKey = "";
      return;
    }
    var key = combat ? "combat:" + combat.hp + ":" + game.state.world.hp : (ev.id + ":" + ev.scene);
    if (ov.dataset.mode === "event" && ov.dataset.eventKey === key) return;
    ov.className = "show";
    ov.innerHTML = "";
    ov.dataset.mode = "event";
    ov.dataset.eventKey = key;
    eventKey = key;
    var modal = document.createElement("div");
    modal.className = "modal" + (isPixel() ? " px-event" : "");
    if (combat) {
      if (isPixel()) {
        modal.appendChild(pxIconEl("beast"));
        modal.lastChild.classList.add("px-event-icon");
      } else {
        modal.innerHTML = "<h2>" + combat.name + "</h2><div class='body'><p>一只野兽从灌木丛里蹿了出来。</p><p>野兽生命 " + combat.hp + " · 你 " + game.state.world.hp + "</p></div>";
      }
      var actsC = document.createElement("div");
      actsC.className = "modal-actions";
      upsertButton(actsC, "punch", { label: "挥拳", icon: "punch", onClick: function () { game.act("combat", { move: "punch" }); } });
      upsertButton(actsC, "flee", { label: "逃跑", icon: "flee", onClick: function () { game.act("combat", { move: "flee" }); } });
      modal.appendChild(actsC);
      ov.appendChild(modal);
      return;
    }
    var spec = ev.spec;
    var scene = ev.scene === "start" ? spec : (spec.scenes && spec.scenes[ev.scene]) || spec;
    if (isPixel()) {
      var evIcon = pxIconEl(eventIcon(ev.id));
      evIcon.classList.add("px-event-icon");
      modal.appendChild(evIcon);
    } else {
      var title = document.createElement("h2");
      title.textContent = spec.title || ADR.t("*** EVENT ***");
      modal.appendChild(title);
      var body = document.createElement("div");
      body.className = "body";
      (scene.text || spec.text || []).forEach(function (line) {
        var p = document.createElement("p");
        p.textContent = line;
        body.appendChild(p);
      });
      modal.appendChild(body);
    }
    var acts = document.createElement("div");
    acts.className = "modal-actions";
    (scene.buttons || spec.buttons || []).forEach(function (b) {
      var disabled = false;
      if (b.cost) {
        disabled = Object.keys(b.cost).some(function (k) { return (game.state.stores[k] || 0) < b.cost[k]; });
      }
      if (b.require_no && (game.state.stores[b.require_no] || 0) > 0) disabled = true;
      var label = b.text;
      if (b.cost) {
        label += "（" + Object.keys(b.cost).map(function (k) { return (ADR.ITEM_CN[k] || k) + b.cost[k]; }).join(" ") + "）";
      }
      upsertButton(acts, "ev-" + b.id, {
        label: label,
        icon: /ignore|goodbye/.test(b.id) ? "no" : (b.cost ? Object.keys(b.cost)[0] : "ok"),
        disabled: disabled,
        onClick: function () { game.act("event_choice", { button: b.id }); }
      });
    });
    modal.appendChild(acts);
    ov.appendChild(modal);
  }

  function renderAll() {
    var loc = game.state.location;
    $("panel-room").className = "panel" + (loc === "room" ? " active" : "");
    $("panel-outside").className = "panel" + (loc === "outside" ? " active" : "");
    $("panel-path").className = "panel" + (loc === "path" || loc === "world" ? " active" : "");
    renderHeader();
    renderNotes();
    renderStores();
    if (loc === "room") renderRoom();
    if (loc === "outside") renderOutside();
    if (loc === "path" || loc === "world") renderPath();
    renderEvent();
    playPhaseWipe(loc);
    if (isPixel()) {
      $("director-label").textContent = "";
      $("director-label").setAttribute("aria-label", game.directorName === "llm" ? "llm" : "rule");
    } else {
      $("director-label").textContent = game.directorName === "llm" ? "导演：语言模型" : "导演：规则";
    }
    paintAmbient();
    lastViewSig = ADR.visualSig(game.state);
  }

  function toast(msg) {
    var el = $("toast");
    if (isPixel()) {
      el.textContent = "";
      el.setAttribute("aria-label", msg);
    } else {
      el.textContent = msg;
    }
    el.className = "show";
    // @pacing-ignore note=toast animation, not game pacing
    setTimeout(function () { el.className = ""; }, 1600);
  }

  function exportTelemetry() {
    var blob = new Blob([game.analytics.exportJson()], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "adr-telemetry-" + game.state.session_id.slice(0, 8) + ".json";
    a.click();
    toast("已导出遥测");
  }

  function openSettings() {
    var ov = $("overlay");
    ov.className = "show";
    ov.dataset.mode = "settings";
    ov.dataset.eventKey = "";
    ov.innerHTML = "";
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML =
      "<h2>设置</h2>" +
      "<form id='settings-form'>" +
      "<label>导演</label>" +
      "<select id='cfg-director'><option value='rule'>规则（离线默认）</option><option value='llm'>语言模型（HTTP）</option></select>" +
      "<label>语言模型端点</label>" +
      "<input id='cfg-llm' placeholder='https://example.com/director' />" +
      "<label>语言模型密钥（只存在本机）</label>" +
      "<input id='cfg-llm-key' type='password' autocomplete='off' />" +
      "<label>遥测 HTTP 端点（可选，覆盖构建时写入的 Supabase）</label>" +
      "<input id='cfg-an' placeholder='https://xxx.supabase.co/rest/v1/playtest_events' />" +
      "<label>遥测 apikey / Authorization（可选）</label>" +
      "<input id='cfg-an-key' type='password' autocomplete='off' />" +
      "<label>时间倍率</label>" +
      "<select id='cfg-scale'><option value='1'>原速</option><option value='2'>加速 ×2</option><option value='4'>试玩 ×4</option></select>" +
      "</form>";
    var acts = document.createElement("div");
    acts.className = "modal-actions";
    var save = document.createElement("button");
    save.type = "button";
    save.className = "adr";
    save.innerHTML = '<span class="btn-label">保存</span>';
    save.addEventListener("click", function () {
      var dir = $("cfg-director").value;
      var llm = $("cfg-llm").value.trim();
      var key = $("cfg-llm-key").value;
      var an = $("cfg-an").value.trim();
      var anKey = $("cfg-an-key").value;
      var scale = parseFloat($("cfg-scale").value);
      game.act("set_director", { name: dir, endpoint: llm, api_key: key });
      game.act("set_timescale", { scale: scale });
      var headers = {};
      if (anKey) {
        headers.apikey = anKey;
        headers.Authorization = "Bearer " + anKey;
        headers.Prefer = "return=minimal";
      }
      game.act("set_analytics", { endpoint: an, enabled: !!an, headers: headers });
      try {
        localStorage.setItem("adr.config", JSON.stringify({
          director: dir, llm_endpoint: llm, analytics_endpoint: an, time_scale: scale
        }));
      } catch (e) { /* ignore */ }
      ov.className = "";
      ov.dataset.mode = "";
      ov.innerHTML = "";
      toast("已保存");
    });
    var close = document.createElement("button");
    close.type = "button";
    close.className = "adr";
    close.innerHTML = '<span class="btn-label">关闭</span>';
    close.addEventListener("click", function () {
      ov.className = "";
      ov.dataset.mode = "";
      ov.innerHTML = "";
    });
    acts.appendChild(save);
    acts.appendChild(close);
    modal.appendChild(acts);
    ov.appendChild(modal);
    $("cfg-director").value = game.directorName;
    $("cfg-llm").value = game.config.llm_endpoint || "";
    $("cfg-an").value = game.analytics.httpEndpoint || "";
    $("cfg-scale").value = String(game.timeScale === 4 ? 4 : game.timeScale === 2 ? 2 : 1);
  }

  function decorateMenuIcons() {
    if (!isPixel()) return;
    ["btn-hyper", "btn-settings", "btn-export", "btn-restart", "btn-classic"].forEach(function (id) {
      var el = $(id);
      if (!el || el.querySelector(".px-icon")) return;
      var icon = el.getAttribute("data-icon") || "spark";
      el.setAttribute("aria-label", el.textContent || icon);
      el.textContent = "";
      el.appendChild(pxIconEl(icon));
    });
  }

  function bindMenu() {
    decorateMenuIcons();
    $("btn-hyper").addEventListener("click", function () {
      var next = game.timeScale >= 2 ? 1 : 2;
      game.act("set_timescale", { scale: next });
      if (isPixel()) {
        $("btn-hyper").setAttribute("aria-label", next >= 2 ? "原速" : "加速");
      } else {
        $("btn-hyper").textContent = next >= 2 ? "原速." : "加速.";
      }
      toast(next >= 2 ? "加速 ×2" : "已恢复原速");
    });
    $("btn-settings").addEventListener("click", openSettings);
    $("btn-export").addEventListener("click", exportTelemetry);
    $("btn-restart").addEventListener("click", function () {
      if (confirm("重开游戏？当前进度会消失。")) game.act("restart");
    });
    $("btn-classic").addEventListener("click", function () {
      window.location.href = "/classic/?lang=zh_cn";
    });
    function persistNow() {
      if (game && game.persistSave) game.persistSave();
    }
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") persistNow();
    });
    window.addEventListener("beforeunload", function () {
      persistNow();
      if (!game) return;
      game.analytics.log(game.state, "quit", {});
      game.analytics.log(game.state, "session_end", { reason: "quit" });
      if (window.ADRTelemetry) {
        ADRTelemetry.pageUnload("beforeunload");
        ADRTelemetry.flush("beforeunload");
      } else if (game.analytics.flushHttp) {
        game.analytics.flushHttp("unload");
      }
    });
    window.ADRSave = {
      key: ADR.SAVE_KEY,
      export: function () { return ADR.readSaveRaw(); },
      restore: function (sessionId) {
        location.search = "restore=" + encodeURIComponent(sessionId);
      },
      importDoc: function (doc) {
        if (!doc) return false;
        var state = ADR.hydrateState(doc.state || doc);
        if (!game) return false;
        game.state = state;
        game.persistSave();
        game.emit();
        return true;
      }
    };
    window.addEventListener("keydown", function (e) {
      if (!game.state.world.on_expedition) return;
      var map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
      var m = map[e.key];
      if (m) {
        e.preventDefault();
        game.act("world_move", { dx: m[0], dy: m[1] });
      }
    });
  }

  function loop(ts) {
    if (!lastRender) lastRender = ts;
    var dt = Math.min(0.25, (ts - lastRender) / 1000);
    lastRender = ts;
    game.tick(dt);
    requestAnimationFrame(loop);
  }

  function applyUrlConfig(cfg) {
    var q = new URLSearchParams(location.search);
    if (q.get("director")) cfg.director = q.get("director");
    if (q.get("llm")) cfg.llm_endpoint = q.get("llm");
    if (q.get("analytics")) {
      cfg.analytics_endpoint = q.get("analytics");
      cfg.analytics_http_enabled = true;
    }
    // @pacing kind=interval id=fast_timescale value=10 phase=room_dark note=debug URL multiplier
    if (q.get("fast") === "1" || q.get("fast") === "true") cfg.time_scale = 10;
    if (q.get("telemetry_debug") === "1" || q.get("telemetry_debug") === "true") cfg.telemetry_debug = true;
    if (q.get("style") === "pixel" || q.get("style") === "text") cfg.style = q.get("style");
    try {
      var saved = JSON.parse(localStorage.getItem("adr.config") || "null");
      if (saved && !q.get("director")) {
        cfg.director = saved.director || cfg.director;
        cfg.llm_endpoint = saved.llm_endpoint || cfg.llm_endpoint;
        cfg.analytics_endpoint = saved.analytics_endpoint || cfg.analytics_endpoint;
        cfg.time_scale = saved.time_scale || cfg.time_scale;
      }
    } catch (e) { /* ignore */ }
    return cfg;
  }

  function boot() {
    Promise.all([
      fetch("../../data/events.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch("../../data/config.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch("data/events.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch("data/config.json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (pair) {
      events = Object.keys(pair[0] || {}).length ? pair[0] : (pair[2] || {});
      config = applyUrlConfig(Object.assign({}, pair[1] || {}, pair[3] || {}));
      applyStyle(resolveStyle(config));
      if (!Object.keys(events).length) {
        console.warn("events catalog missing; director spawn_event will reject");
      }
      game = new ADR.Game(config, events);
      window.__ADR_GAME = game;
      if (window.ADRTelemetry) ADRTelemetry.bindGame(game);
      if (window.ADRSaveTelemetry && ADRSaveTelemetry.hookGame) ADRSaveTelemetry.hookGame(game);
      game.on(renderAll);
      game.hud = paintCooldowns;
      bindMenu();
      renderAll();
      if (window.ADRTelemetry) ADRTelemetry.markFirstFrame();
      requestAnimationFrame(loop);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
