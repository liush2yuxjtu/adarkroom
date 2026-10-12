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
    "build-lodge": "hut", "build-trading_post": "trade", "build-tannery": "fur",
    "build-smokehouse": "cured_meat", "build-workshop": "settings",
    "build-steelworks": "spark", "build-armoury": "spark",
    "build-torch": "light", "build-waterskin": "stores", "build-cask": "stores",
    "build-water_tank": "stores", "build-bone_spear": "punch", "build-rucksack": "fur",
    "build-wagon": "cart", "build-convoy": "cart", "build-l_armour": "fur",
    "build-i_armour": "spark", "build-s_armour": "spark", "build-iron_sword": "punch",
    "build-steel_sword": "punch", "build-rifle": "spark",
    "buy-scales": "fur", "buy-teeth": "fur", "buy-iron": "spark", "buy-coal": "spark",
    "buy-steel": "spark", "buy-medicine": "stores", "buy-bullets": "spark",
    "buy-energy_cell": "spark", "buy-bolas": "punch", "buy-grenade": "spark",
    "buy-bayonet": "punch", "buy-alien_alloy": "spark", "buy-compass": "compass",
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

  function saveHash() {
    var raw = "";
    try { raw = localStorage.getItem("adr.save.v1") || ""; } catch (e) { raw = ""; }
    if (window.ADRSaveTelemetry && ADRSaveTelemetry.checksum) return ADRSaveTelemetry.checksum(raw);
    var h = 2166136261;
    for (var i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function styleActionLabel(style) {
    return style === "pixel" ? "文字." : "像素.";
  }

  function rememberStyleInUrl(style) {
    try {
      var url = new URL(location.href);
      if (url.searchParams.has("style")) {
        url.searchParams.set("style", style);
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch (e) { /* ignore */ }
  }

  function stripStyleChrome() {
    document.querySelectorAll(".px-scene-host").forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    ["panel-room", "panel-outside", "panel-path"].forEach(function (id) {
      var p = $(id);
      if (!p) return;
      delete p.dataset.ready;
      p.innerHTML = "";
    });
    var stores = $("stores");
    if (stores) {
      stores.innerHTML = "";
      delete stores.dataset.html;
    }
    var notes = $("notifications");
    if (notes) notes.innerHTML = "";
    var header = $("header");
    if (header) header.innerHTML = "";
  }

  function restoreMenuLabels() {
    var hyper = $("btn-hyper");
    if (hyper) hyper.textContent = (game && game.timeScale >= 2) ? "原速." : "加速.";
    var settings = $("btn-settings");
    if (settings) settings.textContent = "设置.";
    var exp = $("btn-export");
    if (exp) exp.textContent = "导出遥测.";
    var restart = $("btn-restart");
    if (restart) restart.textContent = "重开.";
    var classic = $("btn-classic");
    if (classic) classic.textContent = "原版.";
    var dir = $("director-label");
    if (dir && game) {
      dir.textContent = game.directorName === "llm" ? "导演：语言模型" : "导演：规则";
      dir.setAttribute("role", "status");
      dir.removeAttribute("aria-label");
    }
  }

  function paintStyleToggle() {
    var el = $("btn-style");
    if (!el) return;
    var label = styleActionLabel(uiStyle);
    var name = label.replace(/\.$/, "");
    el.setAttribute("aria-label", "切换到" + name + "风格");
    el.setAttribute("title", "切换到" + name + "风格");
    el.setAttribute("aria-pressed", uiStyle === "pixel" ? "true" : "false");
    if (isPixel()) {
      if (!el.querySelector(".px-icon")) {
        var icon = pxIconEl(el.getAttribute("data-icon") || "spark");
        var cap = el.querySelector(":scope > .px-caption");
        if (cap) el.insertBefore(icon, cap);
        else {
          while (el.firstChild) el.removeChild(el.firstChild);
          el.appendChild(icon);
        }
      }
      ensureCaption(el, name);
    } else {
      el.textContent = label;
    }
  }

  function switchStyle() {
    var from = uiStyle === "pixel" ? "pixel" : "text";
    var to = from === "pixel" ? "text" : "pixel";
    if (game && game.persistSave) game.persistSave();
    var hashBefore = saveHash();
    persistStyle(to);
    rememberStyleInUrl(to);
    applyStyle(to);
    stripStyleChrome();
    restoreMenuLabels();
    lastViewSig = "";
    lastLoc = "";
    eventKey = "";
    if (game) {
      renderAll();
      decorateMenuIcons();
      paintStyleToggle();
      fitPixelScene();
      emitViewportLayout();
    } else {
      paintStyleToggle();
    }
    var hashAfter = saveHash();
    if (window.ADRTelemetry && ADRTelemetry.log) {
      ADRTelemetry.log("style_toggle", {
        from: from,
        to: to,
        save_hash_before: hashBefore,
        save_hash_after: hashAfter
      });
    }
    toast(to === "pixel" ? "已切换到像素风格" : "已切换到文字风格");
  }

  function pxIconEl(name) {
    var s = document.createElement("span");
    s.className = "px-icon px-" + name;
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  var CUE_CN = {
    fire: "火", wood: "木", person: "人", wind: "风", trap: "阱",
    meat: "食", compass: "针", beast: "兽", sound: "声", trade: "贸", spark: "讯"
  };
  var MENU_CN = {
    "btn-hyper": "加速", "btn-settings": "设置", "btn-export": "导出",
    "btn-restart": "重开", "btn-classic": "原版"
  };
  var loggedCd = {};

  function compactCn(label) {
    var s = String(label || "").replace(/[.。\s]+$/g, "");
    s = s.replace(/[（(].*$/, "").replace(/[:：].*$/, "");
    if (s.length > 4) s = s.slice(0, 4);
    return s;
  }

  function ensureCaption(parent, text) {
    var cap = parent.querySelector(":scope > .px-caption");
    if (!cap) {
      cap = document.createElement("span");
      cap.className = "px-caption";
      cap.setAttribute("aria-hidden", "true");
      parent.appendChild(cap);
    }
    if (cap.textContent !== text) cap.textContent = text;
    return cap;
  }

  function stackCount(n) {
    if (n <= 0) return 0;
    return 1;
  }

  function formatStoreN(n) {
    var x = Number(n) || 0;
    if (x >= 1e6) return x.toExponential(0).replace("+", "");
    return String(Math.round(x));
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
      fitPixelScene();
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
    var host = document.createElement("div");
    host.className = "px-scene-host";
    host.appendChild(sc);
    var title = panel.querySelector(".title");
    if (title) panel.insertBefore(host, title);
    else panel.insertBefore(host, panel.firstChild);
    fitPixelScene();
    return sc;
  }

  function fitChrome() {
    var menu = $("menu");
    var menuH = 72;
    if (menu) {
      var r = menu.getBoundingClientRect();
      menuH = Math.ceil(r.height) + 16;
    }
    document.documentElement.style.setProperty("--adr-menu-h", menuH + "px");
    return menuH;
  }

  function fitPixelScene() {
    var menuH = fitChrome();
    if (!isPixel()) {
      document.body.classList.remove("px-wide");
      document.body.classList.remove("px-has-stores");
      return 1;
    }
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var wide = vw >= 1024;
    document.body.classList.toggle("px-wide", wide);
    var storesBox = $("stores");
    var hasStores = !!(storesBox && storesBox.style.display !== "none");
    document.body.classList.toggle("px-has-stores", hasStores);
    var notesCol = wide ? 196 : 0;
    var side = wide && hasStores ? 168 : 0;
    var gaps = wide ? (hasStores ? 32 : 16) : 0;
    var pad = 32;
    var availW = Math.max(160, vw - pad - notesCol - side - gaps);
    var headerEl = $("header");
    var headerH = headerEl ? headerEl.getBoundingClientRect().height : 64;
    var availH = Math.max(160, vh - menuH - headerH - 16);
    var nativeW = 640;
    var nativeH = 384;
    var scale = Math.min(Math.floor(availW / nativeW) || 0, Math.floor(availH / nativeH) || 0);
    if (scale < 1) scale = 0.5;
    if (scale > 3) scale = 3;
    var uiScale = scale >= 2 ? scale : 1;
    document.documentElement.style.setProperty("--px-ui-scale", String(uiScale));
    document.querySelectorAll(".px-scene").forEach(function (sc) {
      var host = sc.parentElement;
      sc.style.setProperty("--px-scale", String(scale));
      if (host && host.classList.contains("px-scene-host")) {
        host.style.width = Math.round(nativeW * scale) + "px";
        host.style.height = Math.round(nativeH * scale) + "px";
      }
    });
    return scale;
  }

  function paintAmbient() {
    if (!isPixel() || !game) return;
    fitPixelScene();
    var loc = game.state.location;
    var kind = loc === "outside" ? "outside" : loc === "world" ? "world" : loc;
    var panel = loc === "outside" ? $("panel-outside") : loc === "path" || loc === "world" ? $("panel-path") : $("panel-room");
    if (!panel) return;
    var sc = panel.querySelector(".px-scene");
    if (!sc) return;
    var fireEl = sc.querySelector(".px-fire");
    if (fireEl) {
      var hf = hearthFrame(game.state.fire);
      var hw = fireEl.offsetWidth || 128;
      fireEl.style.backgroundPosition = "-" + (hf * hw) + "px 0";
      fireEl.classList.toggle("lit", game.state.fire >= 3);
    }
    var sky = sc.querySelector(".px-sky");
    if (sky) sky.style.backgroundPosition = "-" + (skyIndex(game.state) * 640) + "px 0";
    var pile = sc.querySelector(".px-woodpile");
    if (pile) {
      var woodN = game.state.stores.wood || 0;
      var pw = pile.offsetWidth || 96;
      pile.style.backgroundPosition = "-" + (woodpileFrame(woodN) * pw) + "px 0";
      pile.classList.toggle("empty", woodN <= 0);
    }
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
    if (game && typeof game.cooldownLeft === "function") return game.cooldownLeft(id);
    if (!game || !game.state) return 0;
    var end = game.state.cooldown_ends_at && game.state.cooldown_ends_at[id];
    if (end) {
      var scale = game.timeScale > 0 ? game.timeScale : 1;
      return Math.max(0, ((Number(end) - Date.now()) / 1000) * scale);
    }
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

  function logPixelCd(cdId, left, text) {
    if (!isPixel() || !cdId || !window.ADRTelemetry || !ADRTelemetry.log) return;
    if (left > 0 && !loggedCd[cdId]) {
      loggedCd[cdId] = true;
      ADRTelemetry.log("pixel_cd_sec", {
        cd_id: cdId,
        remaining: Math.round(left * 10) / 10,
        text: text,
        shown: !!text
      });
    }
    if (left <= 0) loggedCd[cdId] = false;
  }

  function paintCdBar(b, cdId) {
    var barEl = b.querySelector(".cd");
    var secEl = b.querySelector(".cd-sec");
    var left = cdId ? cdLeft(cdId) : 0;
    var ratio = cdId ? cdRatio(cdId) : 0;
    var secText = left > 0 ? String(Math.ceil(left)) : "";
    if (secEl) secEl.textContent = secText;
    if (isPixel()) {
      if (cdId === "stoke") {
        var flame = b.querySelector(".px-flame");
        if (flame && game) {
          var fr = stokeFrame(ratio, game.state.fire);
          var fw = flame.offsetWidth || 80;
          flame.style.backgroundPosition = "-" + (fr * fw) + "px 0";
          flame.classList.toggle("ready", left <= 0);
        }
        if (barEl) barEl.style.width = "0%";
        logPixelCd(cdId, left, secText);
        return;
      }
      if (barEl) barEl.style.width = (ratio * 100) + "%";
      logPixelCd(cdId, left, secText);
      return;
    }
    if (barEl) {
      barEl.style.width = (ratio * 100) + "%";
      var max = { stoke: 10, gather: 60, traps: 90 }[cdId] || 1;
      barEl.style.animationDelay = left > 0 ? (-(max - left)) + "s" : "0s";
    }
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
      b.setAttribute("title", spec.label || key);
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
      ensureCaption(b, compactCn(spec.label || key));
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
        b.setAttribute("title", tab.label);
        if (!b.querySelector(".px-icon")) {
          while (b.firstChild) b.removeChild(b.firstChild);
          b.appendChild(pxIconEl(iconName));
        }
        ensureCaption(b, compactCn(tab.label));
      } else if (b.textContent !== tab.label) {
        b.textContent = tab.label;
      }
      var locked = !game.state.unlocked[tab.id] && tab.id !== "room";
      b.disabled = locked;
      var active = game.state.location === tab.id || (tab.id === "path" && game.state.location === "world");
      b.className = (active ? "active" : "") + (isPixel() ? " px-tab" : "");
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
    var want = notes.map(function (n) {
      if (isPixel()) return cueForNote(n.text) + (n.count > 1 ? ":" + n.count : "") + "|" + noteLabel(n);
      return noteLabel(n);
    });
    if (isPixel()) want.unshift("legend");
    var have = [].slice.call(box.querySelectorAll(".note, .px-notes-legend")).map(function (n) {
      if (n.classList.contains("px-notes-legend")) return "legend";
      if (isPixel()) return (n.dataset.cue || "") + (n.dataset.count || "") + "|" + (n.getAttribute("title") || "");
      return n.textContent;
    });
    if (want.join("\n") === have.join("\n")) {
      syncScrollable(box, "游戏消息");
      return;
    }
    box.innerHTML = "";
    if (isPixel()) {
      var legend = document.createElement("div");
      legend.className = "px-notes-legend";
      legend.textContent = "消息";
      legend.setAttribute("title", "游戏消息：图标旁的字是类别，悬停可看全文");
      legend.setAttribute("role", "note");
      box.appendChild(legend);
    }
    notes.forEach(function (n, i) {
      var d = document.createElement("div");
      d.className = i >= 8 ? "note fade" : "note";
      if (isPixel()) {
        var cue = cueForNote(n.text);
        d.dataset.cue = cue;
        if (n.count > 1) d.dataset.count = ":" + n.count;
        d.setAttribute("aria-label", noteLabel(n));
        d.setAttribute("title", noteLabel(n));
        d.setAttribute("role", "img");
        d.appendChild(pxIconEl(cue));
        var cap = document.createElement("span");
        cap.className = "px-caption px-note-cat";
        cap.textContent = CUE_CN[cue] || "讯";
        d.appendChild(cap);
        var body = document.createElement("span");
        body.className = "px-note-text";
        body.textContent = noteLabel(n);
        d.appendChild(body);
      } else {
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
      }
      box.appendChild(d);
    });
    syncScrollable(box, "游戏消息");
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
      html = '<div class="legend px-icon px-stores" role="img" aria-label="' + ADR.t("stores") + '" title="' + ADR.t("stores") + '"></div><span class="px-caption px-stores-caption">' + ADR.t("stores") + "</span>";
      ADR.ITEMS.forEach(function (k) {
        var n = game.state.stores[k] || 0;
        if (n <= 0 && k !== "wood") return;
        if (k === "wood" && !game.state.wood_initialized) return;
        var icon = ({ cured_meat: "cured_meat", leather: "fur", iron: "spark", coal: "spark", steel: "spark", sulphur: "spark", bullets: "spark" }[k]) || k;
        html += '<div class="store-row" role="group" aria-label="' + (ADR.ITEM_CN[k] || k) + " " + n + '">';
        html += '<span class="px-icon px-' + icon + '" aria-hidden="true"></span>';
        html += '<span class="px-caption px-store-n">' + formatStoreN(n) + "</span></div>";
      });
      if (game.state.buildings.hut > 0 || game.state.population > 0) {
        html += '<div class="store-row" role="group" aria-label="pop ' + game.state.population + '">';
        html += '<span class="px-icon px-pop" aria-hidden="true"></span>';
        html += '<span class="px-caption px-store-n">' + formatStoreN(game.state.population) + "</span></div>";
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
      if (isPixel() && window.ADRTelemetry && ADRTelemetry.log) {
        ADRTelemetry.log("store_count", {
          wood: game.state.stores.wood || 0,
          shown: true,
          icon_cap: 1
        });
      }
    }
    syncScrollable(box, ADR.t("stores"));
  }

  function syncScrollable(el, label) {
    if (!el) return;
    var canScroll = false;
    try {
      var cs = getComputedStyle(el);
      var oy = cs.overflowY;
      canScroll = (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
    } catch (e) {
      canScroll = el.scrollHeight > el.clientHeight + 1;
    }
    if (canScroll || el.id === "notifications") {
      el.setAttribute("tabindex", "0");
      if (label && !el.getAttribute("aria-label")) el.setAttribute("aria-label", label);
    } else if (el.getAttribute("tabindex") === "0" && el.id !== "notifications") {
      el.removeAttribute("tabindex");
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
    if (panelId === "panel-room") {
      var craftWrap = document.createElement("div");
      craftWrap.id = "room-craft-wrap";
      craftWrap.className = "craft-wrap";
      craftWrap.hidden = true;
      var legend = document.createElement("div");
      legend.className = "btn-legend";
      legend.id = "room-craft-legend";
      legend.textContent = ADR.t("craft:");
      var craftCol = document.createElement("div");
      craftCol.className = "btn-col";
      craftCol.id = "room-craft-btns";
      craftWrap.appendChild(legend);
      craftWrap.appendChild(craftCol);
      p.appendChild(craftWrap);
      var buyWrap = document.createElement("div");
      buyWrap.id = "room-buy-wrap";
      buyWrap.className = "craft-wrap";
      buyWrap.hidden = true;
      var buyLegend = document.createElement("div");
      buyLegend.className = "btn-legend";
      buyLegend.id = "room-buy-legend";
      buyLegend.textContent = ADR.t("buy:");
      var buyCol = document.createElement("div");
      buyCol.className = "btn-col";
      buyCol.id = "room-buy-btns";
      buyWrap.appendChild(buyLegend);
      buyWrap.appendChild(buyCol);
      p.appendChild(buyWrap);
    }
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
    var craftKeys = [];
    upsertButton($("room-btns"), "fire", {
      label: game.state.fire <= 0 ? ADR.t("light fire") : ADR.t("stoke fire"),
      icon: game.state.fire <= 0 ? "light" : "stoke",
      cdId: "stoke",
      onClick: function () {
        game.act(game.state.fire <= 0 ? "light_fire" : "stoke_fire");
      }
    });
    var craftHost = $("room-craft-btns");
    var craftWrap = $("room-craft-wrap");
    ADR.Game.prototype.visibleCrafts.call(game).forEach(function (c) {
      var name = (c.section === "craft"
        ? (ADR.ITEM_CN && ADR.ITEM_CN[c.kind])
        : (ADR.BUILDING_CN && ADR.BUILDING_CN[c.kind])) || { trap: "陷阱", cart: "货车", hut: "小屋" }[c.kind] || c.kind;
      var cost = Object.keys(c.cost).map(function (k) {
        return (ADR.ITEM_CN[k] || k) + c.cost[k];
      }).join(" ");
      var btnKey = "build-" + c.kind;
      var host = c.section === "craft" && craftHost ? craftHost : $("room-btns");
      if (c.section === "craft") craftKeys.push(btnKey);
      else keys.push(btnKey);
      upsertButton(host, btnKey, {
        label: name + " (" + cost + ")",
        icon: PX_ICON[btnKey] || c.kind,
        disabled: !c.can,
        onClick: function () { game.act("build", { kind: c.kind }); }
      });
    });
    keepButtons($("room-btns"), keys);
    if (craftHost) keepButtons(craftHost, craftKeys);
    if (craftWrap) {
      var showCraft = craftKeys.length > 0;
      craftWrap.hidden = !showCraft;
      if (isPixel()) {
        var lg = $("room-craft-legend");
        if (lg) lg.textContent = showCraft ? ADR.t("craft:") : "";
      }
    }
    var buyHost = $("room-buy-btns");
    var buyWrapEl = $("room-buy-wrap");
    var buyKeys = [];
    if (ADR.Game.prototype.visibleTrades) {
      ADR.Game.prototype.visibleTrades.call(game).forEach(function (c) {
        var name = (ADR.ITEM_CN && ADR.ITEM_CN[c.kind]) || c.kind;
        var cost = Object.keys(c.cost).map(function (k) {
          return (ADR.ITEM_CN[k] || k) + c.cost[k];
        }).join(" ");
        var btnKey = "buy-" + c.kind;
        buyKeys.push(btnKey);
        if (!buyHost) return;
        upsertButton(buyHost, btnKey, {
          label: name + " (" + cost + ")",
          icon: PX_ICON[btnKey] || "trade",
          disabled: !c.can,
          onClick: function () { game.act("buy", { kind: c.kind }); }
        });
      });
    }
    if (buyHost) keepButtons(buyHost, buyKeys);
    if (buyWrapEl) {
      var showBuy = buyKeys.length > 0;
      buyWrapEl.hidden = !showBuy;
      if (isPixel()) {
        var bl = $("room-buy-legend");
        if (bl) bl.textContent = showBuy ? ADR.t("buy:") : "";
      }
    }
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
    renderWorkers();
    var hint = $("out-hint");
    if (game.state.population > 0 && !isPixel()) {
      hint.textContent = ADR.t("pop ") + game.state.population + " / " + ((game.state.buildings.hut || 0) * 4);
      hint.style.display = "";
    } else {
      hint.textContent = "";
      hint.style.display = "none";
    }
  }

  function renderWorkers() {
    var panel = $("panel-outside");
    if (!panel) return;
    var host = $("workers");
    if (!host) {
      host = document.createElement("div");
      host.id = "workers";
      host.className = "workers";
      var hint = $("out-hint");
      if (hint && hint.parentNode) hint.parentNode.insertBefore(host, hint);
      else panel.appendChild(host);
    }
    var jobs = typeof ADR.visibleJobs === "function" ? ADR.visibleJobs(game.state) : [];
    if (!jobs.length) {
      host.style.display = "none";
      host.innerHTML = "";
      delete host.dataset.html;
      return;
    }
    host.style.display = "";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "村民工作");
    var gatherers = game.state.workers.gatherer || 0;
    var existing = {};
    [].slice.call(host.querySelectorAll(".worker-row")).forEach(function (row) {
      existing[row.dataset.job] = row;
    });
    jobs.forEach(function (job) {
      var n = job === "gatherer" ? gatherers : (game.state.workers[job] || 0);
      var label = (ADR.WORKER_CN && ADR.WORKER_CN[job]) || ADR.t(job) || job;
      var row = existing[job];
      if (!row) {
        row = document.createElement("div");
        row.className = "worker-row";
        row.dataset.job = job;
        row.setAttribute("role", "group");
        host.appendChild(row);
      }
      row.setAttribute("aria-label", label + " " + n);
      if (isPixel()) {
        if (row.dataset.mode !== "pixel") {
          row.innerHTML = "";
          row.dataset.mode = "pixel";
          var ic = document.createElement("span");
          ic.className = "px-icon px-person";
          ic.setAttribute("aria-hidden", "true");
          row.appendChild(ic);
          var cap = document.createElement("span");
          cap.className = "px-caption worker-name";
          cap.textContent = label;
          row.appendChild(cap);
          var cnt = document.createElement("span");
          cnt.className = "px-caption worker-count";
          cnt.textContent = String(n);
          row.appendChild(cnt);
          if (job !== "gatherer") {
            [-1, 1].forEach(function (d) {
              var b = document.createElement("button");
              b.type = "button";
              b.className = "worker-btn px-btn";
              b.dataset.delta = String(d);
              b.setAttribute("aria-label", (d > 0 ? "分配 " : "撤下 ") + label);
              b.appendChild(pxIconEl(d > 0 ? "plus" : "minus"));
              b.addEventListener("click", function () {
                game.act("assign_worker", { job: job, delta: d });
              });
              row.appendChild(b);
            });
          }
        } else {
          var countEl = row.querySelector(".worker-count");
          if (countEl) countEl.textContent = String(n);
        }
      } else if (row.dataset.mode !== "text") {
        row.innerHTML = "";
        row.dataset.mode = "text";
        var name = document.createElement("span");
        name.className = "worker-name";
        name.textContent = label;
        row.appendChild(name);
        var count = document.createElement("span");
        count.className = "worker-count";
        count.textContent = String(n);
        row.appendChild(count);
        if (job !== "gatherer") {
          [
            { d: -10, t: "−10" },
            { d: -1, t: "−" },
            { d: 1, t: "+" },
            { d: 10, t: "+10" }
          ].forEach(function (spec) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "worker-btn";
            b.dataset.delta = String(spec.d);
            b.textContent = spec.t;
            b.setAttribute("aria-label", (spec.d > 0 ? "分配 " : "撤下 ") + Math.abs(spec.d) + " 名" + label);
            b.addEventListener("click", function () {
              game.act("assign_worker", { job: job, delta: spec.d });
            });
            row.appendChild(b);
          });
        }
      } else {
        var c2 = row.querySelector(".worker-count");
        if (c2) c2.textContent = String(n);
      }
      var canUp = gatherers > 0;
      var canDown = n > 0;
      [].slice.call(row.querySelectorAll(".worker-btn")).forEach(function (b) {
        var d = Number(b.dataset.delta) || 0;
        b.disabled = d > 0 ? !canUp : !canDown;
      });
      delete existing[job];
    });
    Object.keys(existing).forEach(function (job) {
      if (existing[job].parentNode) existing[job].parentNode.removeChild(existing[job]);
    });
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
    var armourName = ADR.t("none");
    if ((game.state.stores.s_armour || 0) > 0) armourName = ADR.t("steel");
    else if ((game.state.stores.i_armour || 0) > 0) armourName = ADR.t("iron");
    else if ((game.state.stores.l_armour || 0) > 0) armourName = ADR.t("leather");
    var info = document.createElement("div");
    info.className = "path-outfit-meta";
    var waterMax = ADR.getMaxWater ? ADR.getMaxWater(game.state) : 10;
    var cap = ADR.bagCapacity ? ADR.bagCapacity(game.state) : 10;
    var used = ADR.bagUsed ? ADR.bagUsed(game.state) : 0;
    var freeTxt = ADR.t("free {0}/{1}").replace("{0}", String(Math.floor(cap - used))).replace("{1}", String(cap));
    if (isPixel()) {
      info.setAttribute("aria-label", ADR.t("armour") + " " + armourName + " " + ADR.t("water") + " " + waterMax);
    } else {
      info.innerHTML = "<div>" + ADR.t("armour") + " " + armourName + "</div><div>" + ADR.t("water") + " " + waterMax + "</div><div>" + freeTxt + "</div>";
    }
    extraBox.appendChild(info);
    var supplies = document.createElement("div");
    if (isPixel()) supplies.appendChild(pxIconEl("stores"));
    else supplies.textContent = ADR.t("supplies:");
    extraBox.appendChild(supplies);
    var packItems = ["meat", "cured_meat", "fur", "torch", "bone_spear", "iron_sword", "steel_sword", "rifle", "bullets", "medicine", "energy_cell", "bolas", "grenade", "bayonet", "alien_alloy"];
    packItems.forEach(function (item) {
      var have = game.state.stores[item] || 0;
      var packed = game.state.outfit[item] || 0;
      if (["torch", "bone_spear", "iron_sword", "steel_sword", "rifle", "bullets", "medicine", "energy_cell", "bolas", "grenade", "bayonet", "alien_alloy"].indexOf(item) >= 0 && have <= 0 && packed <= 0) return;
      var row = document.createElement("div");
      row.className = "pack-row";
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
      if (isPixel()) {
        minus.appendChild(pxIconEl("minus"));
        minus.setAttribute("aria-label", "减少");
        minus.setAttribute("title", "减少");
        ensureCaption(minus, "减");
      }
      minus.addEventListener("click", function () { game.act("pack", { item: item, amount: -1 }); });
      var plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = isPixel() ? "" : "+";
      if (isPixel()) {
        plus.appendChild(pxIconEl("plus"));
        plus.setAttribute("aria-label", "增加");
        plus.setAttribute("title", "增加");
        ensureCaption(plus, "加");
      }
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
    fitChrome();
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
      var dirText = game.directorName === "llm" ? "模型" : "规则";
      var dir = $("director-label");
      dir.setAttribute("role", "status");
      dir.removeAttribute("aria-label");
      dir.setAttribute("title", "导演：" + dirText);
      if (!dir.querySelector(".px-icon")) {
        dir.textContent = "";
        dir.appendChild(pxIconEl("director"));
      }
      ensureCaption(dir, dirText);
    } else {
      $("director-label").textContent = game.directorName === "llm" ? "导演：语言模型" : "导演：规则";
      $("director-label").setAttribute("role", "status");
      $("director-label").removeAttribute("aria-label");
    }
    paintAmbient();
    lastViewSig = ADR.visualSig(game.state);
  }

  function toast(msg) {
    var el = $("toast");
    if (isPixel()) {
      el.textContent = "";
      el.setAttribute("aria-label", msg);
      el.setAttribute("title", msg);
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
    ["btn-style", "btn-hyper", "btn-settings", "btn-export", "btn-restart", "btn-classic"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var icon = el.getAttribute("data-icon") || "spark";
      var raw = id === "btn-style"
        ? compactCn(styleActionLabel(uiStyle))
        : (MENU_CN[id] || compactCn(el.textContent || el.getAttribute("aria-label") || icon));
      el.setAttribute("aria-label", raw);
      el.setAttribute("title", raw);
      if (!el.querySelector(".px-icon")) {
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(pxIconEl(icon));
      }
      ensureCaption(el, raw);
    });
  }

  function emitViewportLayout() {
    if (!window.ADRTelemetry || !ADRTelemetry.log) return;
    var w = window.innerWidth || 0;
    var h = window.innerHeight || 0;
    var layout = w <= 768 ? "mobile" : "desktop";
    var box = $("notifications");
    var r = box ? box.getBoundingClientRect() : null;
    var visible = !!(r && r.width > 0 && r.height > 0 && r.right > 0 && r.left < w && r.bottom > 0 && r.top < h);
    var scene = document.querySelector(".px-scene");
    var host = document.querySelector(".px-scene-host");
    var stores = $("stores");
    var hearth = document.querySelector(".px-hearth");
    var hostR = host ? host.getBoundingClientRect() : null;
    var storesR = stores && stores.style.display !== "none" ? stores.getBoundingClientRect() : null;
    var hearthR = hearth ? hearth.getBoundingClientRect() : null;
    var sceneVisible = 0;
    if (hostR && hostR.width > 0) {
      var visW = Math.min(hostR.right, w) - Math.max(hostR.left, 0);
      sceneVisible = visW / hostR.width;
    }
    var overlap = false;
    if (storesR && hostR && storesR.width > 0 && hostR.width > 0) {
      overlap = !(storesR.right <= hostR.left || storesR.left >= hostR.right || storesR.bottom <= hostR.top || storesR.top >= hostR.bottom);
    }
    var scale = scene ? parseFloat(getComputedStyle(scene).getPropertyValue("--px-scale")) || 1 : null;
    ADRTelemetry.log("viewport_layout", {
      width: w,
      height: h,
      layout: layout,
      notif_visible: visible
    });
    if (isPixel()) {
      ADRTelemetry.log("pixel_layout", {
        width: w,
        height: h,
        layout: layout,
        scale: scale,
        scene_visible: Math.round(sceneVisible * 1000) / 1000,
        hearth_in_view: !!(hearthR && hearthR.width > 0 && hearthR.left >= -1 && hearthR.right <= w + 1),
        stores_overlap: overlap,
        notes_x: r ? Math.round(r.x) : null,
        notes_visible: visible && !!(r && r.x >= -1)
      });
      emitPixelAudit(w, h, hostR, scale);
    } else {
      emitTextTabAudit(w, h);
    }
  }

  function emitPixelAudit(w, h, hostR, scale) {
    if (!window.ADRTelemetry || !ADRTelemetry.log) return;
    var caps = [].slice.call(document.querySelectorAll(".px-caption")).map(function (el) {
      var cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      return {
        text: el.textContent,
        visible: r.width > 0 && r.height > 0 && cs.fontSize !== "0px" && cs.color !== "transparent" && cs.display !== "none"
      };
    });
    ADRTelemetry.log("pixel_btn_label", {
      count: caps.length,
      visible: caps.filter(function (c) { return c.visible && c.text; }).length,
      samples: caps.slice(0, 8).map(function (c) { return c.text; })
    });
    var noteLegend = document.querySelector(".px-notes-legend");
    var notes = [].slice.call(document.querySelectorAll("#notifications .note"));
    ADRTelemetry.log("pixel_note_meaning", {
      has_legend: !!(noteLegend && noteLegend.textContent),
      note_count: notes.length,
      titled: notes.filter(function (n) { return !!n.getAttribute("title"); }).length,
      captioned: notes.filter(function (n) { return !!(n.querySelector(".px-caption") || {}).textContent; }).length,
      has_body_text: notes.filter(function (n) {
        var t = n.querySelector(".px-note-text");
        return !!(t && t.textContent && t.textContent.length > 1);
      }).length
    });
    ADRTelemetry.log("note_full_text", {
      count: notes.length,
      with_body: notes.filter(function (n) { return !!(n.querySelector(".px-note-text") || {}).textContent; }).length
    });
    var menu = document.getElementById("menu");
    var menuR = menu ? menu.getBoundingClientRect() : null;
    var styleBtn = document.getElementById("btn-style");
    var styleR = styleBtn ? styleBtn.getBoundingClientRect() : null;
    var noteR = document.getElementById("notifications");
    var nR = noteR ? noteR.getBoundingClientRect() : null;
    var menuNotes = !!(menuR && nR && menuR.width > 0 && nR.width > 0 &&
      !(menuR.right <= nR.left || menuR.left >= nR.right || menuR.bottom <= nR.top || menuR.top >= nR.bottom));
    ADRTelemetry.log("toolbar_layout", {
      width: w,
      height: h,
      menu_h: menuR ? Math.round(menuR.height) : null,
      btn_style_w: styleR ? Math.round(styleR.width) : null,
      btn_style_h: styleR ? Math.round(styleR.height) : null,
      notes_y: nR ? Math.round(nR.y) : null,
      overlap_notes: menuNotes
    });
    var unusedRight = hostR ? Math.max(0, w - hostR.right) : 0;
    ADRTelemetry.log("pixel_wide_layout", {
      width: w,
      height: h,
      scale: scale,
      two_col: document.body.classList.contains("px-wide"),
      host_x: hostR ? Math.round(hostR.x) : null,
      host_w: hostR ? Math.round(hostR.width) : null,
      unused_right: Math.round(unusedRight),
      unused_right_pct: w ? Math.round((unusedRight / w) * 1000) / 1000 : null
    });
    var hearth = document.querySelector(".px-fire");
    var scene = document.querySelector(".px-scene");
    var icon = document.querySelector(".px-icon");
    var readIR = function (el) { return el ? getComputedStyle(el).imageRendering : null; };
    ADRTelemetry.log("image_rendering", {
      hearth: readIR(hearth),
      scene: readIR(scene),
      icon: readIR(icon),
      body: readIR(document.body)
    });
  }

  function emitTextTabAudit(w, h) {
    if (!window.ADRTelemetry || !ADRTelemetry.log) return;
    var tabs = [].slice.call(document.querySelectorAll("#header button")).map(function (b) {
      var r = b.getBoundingClientRect();
      return { text: (b.textContent || "").slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) };
    });
    ADRTelemetry.log("text_tab_target", {
      width: w,
      height: h,
      tabs: tabs,
      min_h: tabs.reduce(function (m, t) { return Math.min(m, t.h || 99); }, 99)
    });
  }

  function bindMenu() {
    decorateMenuIcons();
    paintStyleToggle();
    $("btn-style").addEventListener("click", function () {
      switchStyle();
    });
    $("btn-hyper").addEventListener("click", function () {
      var next = game.timeScale >= 2 ? 1 : 2;
      game.act("set_timescale", { scale: next });
      if (isPixel()) {
        var hyperLbl = next >= 2 ? "原速" : "加速";
        $("btn-hyper").setAttribute("aria-label", hyperLbl);
        $("btn-hyper").setAttribute("title", hyperLbl);
        ensureCaption($("btn-hyper"), hyperLbl);
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
      if (document.visibilityState === "hidden") {
        persistNow();
        if (game && game.logCooldownVisibility) game.logCooldownVisibility("hidden");
        return;
      }
      lastRender = 0;
      if (game && game.syncCooldowns) game.syncCooldowns();
      paintCooldowns();
      if (game && game.emit) game.emit();
      if (game && game.logCooldownVisibility) game.logCooldownVisibility("visible");
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
      paintStyleToggle();
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
      fitPixelScene();
      emitViewportLayout();
      var resizeTimer = 0;
      window.addEventListener("resize", function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          fitPixelScene();
          emitViewportLayout();
        }, 250);
      });
      if (window.ADRTelemetry) ADRTelemetry.markFirstFrame();
      requestAnimationFrame(loop);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
