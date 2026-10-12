/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function () {
  "use strict";

  var game;
  var events = {};
  var config = {};
  var lastRender = 0;
  var lastViewSig = "";
  var eventKey = "";

  function $(id) { return document.getElementById(id); }

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
    if (labEl.textContent !== spec.label) labEl.textContent = spec.label;
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
      if (b.textContent !== tab.label) b.textContent = tab.label;
      var locked = !game.state.unlocked[tab.id] && tab.id !== "room";
      b.disabled = locked;
      var active = game.state.location === tab.id || (tab.id === "path" && game.state.location === "world");
      b.className = active ? "active" : "";
    });
  }

  function noteLabel(n) {
    var text = n && n.text ? n.text : "";
    var count = n && n.count > 1 ? n.count : 0;
    return count ? text + " ×" + count : text;
  }

  function renderNotes() {
    var box = $("notifications");
    var notes = game.state.notifications.slice(0, 30);
    var want = notes.map(noteLabel);
    var have = [].slice.call(box.querySelectorAll(".note")).map(function (n) { return n.textContent; });
    if (want.join("\n") === have.join("\n")) return;
    box.innerHTML = "";
    notes.forEach(function (n, i) {
      var d = document.createElement("div");
      d.className = i >= 8 ? "note fade" : "note";
      var label = document.createElement("span");
      label.className = "note-text";
      label.textContent = n.text;
      d.appendChild(label);
      if (n.count > 1) {
        var times = document.createElement("span");
        times.className = "times";
        times.textContent = " ×" + n.count;
        d.appendChild(times);
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
    var html = '<div class="legend">' + ADR.t("stores") + "</div>";
    ADR.ITEMS.forEach(function (k) {
      var n = game.state.stores[k] || 0;
      if (n <= 0 && k !== "wood") return;
      if (k === "wood" && !game.state.wood_initialized) return;
      html += '<div class="store-row"><span>' + (ADR.ITEM_CN[k] || k) + '</span><span class="n">' + n + "</span></div>";
    });
    if (game.state.buildings.hut > 0 || game.state.population > 0) {
      html += '<div class="store-row"><span>' + ADR.t("pop ") + '</span><span class="n">' + game.state.population + "</span></div>";
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
    p.dataset.ready = "1";
    return p;
  }

  function renderRoom() {
    ensureScaffold("panel-room", "room-title", "room-status", "room-btns", "room-hint");
    $("room-title").textContent = ADR.roomTitle(game.state);
    $("room-status").innerHTML = "房间" + ADR.TEMP[game.state.temperature] + "<br>火堆" + ADR.FIRE[game.state.fire];
    var keys = ["fire"];
    upsertButton($("room-btns"), "fire", {
      label: game.state.fire <= 0 ? ADR.t("light fire") : ADR.t("stoke fire"),
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
        disabled: !c.can,
        onClick: function () { game.act("build", { kind: c.kind }); }
      });
    });
    keepButtons($("room-btns"), keys);
    var hint = $("room-hint");
    if (game.state.builder_level >= 1 && game.state.builder_level < 4) {
      hint.textContent = "角落里有人。把屋子烧暖些。";
      hint.style.display = "";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }

  function renderOutside() {
    ensureScaffold("panel-outside", "out-title", "out-status", "out-btns", "out-hint");
    $("out-title").textContent = ADR.hutTitle(game.state.buildings.hut);
    $("out-status").textContent = game.state.buildings.hut > 0
      ? ADR.t("the sky is grey and the wind blows relentlessly")
      : ADR.t("dry brush and dead branches litter the forest floor");
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
    if (game.state.population > 0) {
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
      $("path-title").textContent = ADR.t("A Barren World");
      var s = game.state.world;
      $("path-status").textContent = "生命 " + s.hp + "/" + s.max_hp + "  ·  水 " + s.water + "  ·  肉 " + ((game.state.outfit.meat || 0) + (game.state.outfit.cured_meat || 0));
      var map = $("world-map");
      if (!map) {
        map = document.createElement("div");
        map.id = "world-map";
        $("path-status").insertAdjacentElement("afterend", map);
      }
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
      var dirs = [["north", "北", 0, -1], ["west", "西", -1, 0], ["east", "东", 1, 0], ["south", "南", 0, 1]];
      dirs.forEach(function (d) {
        upsertButton($("path-btns"), d[0], {
          label: d[1],
          onClick: function () { game.act("world_move", { dx: d[2], dy: d[3] }); }
        });
      });
      keepButtons($("path-btns"), ["north", "west", "east", "south"]);
      $("path-hint").textContent = "WASD 或方向键移动。H 是旧房子，A 是村落。";
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
    $("path-title").textContent = ADR.t("A Dusty Path");
    $("path-status").textContent = ADR.t("the compass points east");
    var extraBox = $("path-extra");
    extraBox.innerHTML = "";
    if (game.state.slice_complete) {
      var ban = document.createElement("div");
      ban.id = "slice-banner";
      ban.className = "show";
      ban.textContent = "尘途的第一段已经走完。你可以继续在林中经营，或导出这次试玩的遥测。";
      extraBox.appendChild(ban);
    }
    var supplies = document.createElement("div");
    supplies.textContent = ADR.t("supplies:");
    extraBox.appendChild(supplies);
    ["meat", "cured_meat", "fur"].forEach(function (item) {
      var row = document.createElement("div");
      row.className = "pack-row";
      var have = game.state.stores[item] || 0;
      var packed = game.state.outfit[item] || 0;
      row.innerHTML = "<span>" + (ADR.ITEM_CN[item] || item) + " 库存" + have + " / 行装" + packed + "</span>";
      var minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.addEventListener("click", function () { game.act("pack", { item: item, amount: -1 }); });
      var plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
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
    $("path-hint").textContent = "带上肉再出发。向东北走，能看见一座旧房子。回到村子格子即可回家。";
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
    modal.className = "modal";
    if (combat) {
      modal.innerHTML = "<h2>" + combat.name + "</h2><div class='body'><p>一只野兽从灌木丛里蹿了出来。</p><p>野兽生命 " + combat.hp + " · 你 " + game.state.world.hp + "</p></div>";
      var actsC = document.createElement("div");
      actsC.className = "modal-actions";
      upsertButton(actsC, "punch", { label: "挥拳", onClick: function () { game.act("combat", { move: "punch" }); } });
      upsertButton(actsC, "flee", { label: "逃跑", onClick: function () { game.act("combat", { move: "flee" }); } });
      modal.appendChild(actsC);
      ov.appendChild(modal);
      return;
    }
    var spec = ev.spec;
    var scene = ev.scene === "start" ? spec : (spec.scenes && spec.scenes[ev.scene]) || spec;
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
    $("director-label").textContent = game.directorName === "llm" ? "导演：语言模型" : "导演：规则";
    lastViewSig = ADR.visualSig(game.state);
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
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

  function emitViewportLayout() {
    if (!window.ADRTelemetry || !ADRTelemetry.log) return;
    var w = window.innerWidth || 0;
    var layout = w <= 768 ? "mobile" : "desktop";
    var box = $("notifications");
    var r = box ? box.getBoundingClientRect() : null;
    var visible = !!(r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < w && r.bottom > 0 && r.top < (window.innerHeight || 0));
    ADRTelemetry.log("viewport_layout", {
      width: w,
      height: window.innerHeight || 0,
      layout: layout,
      notif_visible: visible
    });
  }

  function bindMenu() {
    $("btn-hyper").addEventListener("click", function () {
      var next = game.timeScale >= 2 ? 1 : 2;
      game.act("set_timescale", { scale: next });
      $("btn-hyper").textContent = next >= 2 ? "原速." : "加速.";
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
      emitViewportLayout();
      var resizeTimer = 0;
      window.addEventListener("resize", function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(emitViewportLayout, 250);
      });
      if (window.ADRTelemetry) ADRTelemetry.markFirstFrame();
      requestAnimationFrame(loop);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
