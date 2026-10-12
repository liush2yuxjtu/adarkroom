/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function () {
  "use strict";

  var game;
  var events = {};
  var config = {};
  var lastRender = 0;

  function $(id) { return document.getElementById(id); }

  function cdRatio(id) {
    var left = game.state.cooldowns[id] || 0;
    var max = { stoke: 10, gather: 60, traps: 90 }[id] || 1;
    return left > 0 ? left / max : 0;
  }

  function btn(label, disabled, onClick, cdId) {
    var b = document.createElement("button");
    b.className = "adr";
    b.textContent = label;
    if (disabled) b.disabled = true;
    if (cdId && (game.state.cooldowns[cdId] || 0) > 0) {
      b.disabled = true;
      var bar = document.createElement("span");
      bar.className = "cd";
      bar.style.width = (cdRatio(cdId) * 100) + "%";
      b.appendChild(bar);
    }
    b.addEventListener("click", onClick);
    return b;
  }

  function renderHeader() {
    var h = $("header");
    h.innerHTML = "";
    var tabs = [
      { id: "room", label: ADR.roomTitle(game.state) },
      { id: "outside", label: game.state.unlocked.outside ? ADR.hutTitle(game.state.buildings.hut) : ADR.t("Outside") },
      { id: "path", label: ADR.t("A Dusty Path") }
    ];
    tabs.forEach(function (tab) {
      var b = document.createElement("button");
      b.textContent = tab.label;
      if (!game.state.unlocked[tab.id] && tab.id !== "room") b.disabled = true;
      if (game.state.location === tab.id || (tab.id === "path" && game.state.location === "world")) b.className = "active";
      b.addEventListener("click", function () {
        if (game.state.world.on_expedition) return;
        game.act("travel", { area: tab.id });
      });
      h.appendChild(b);
    });
  }

  function renderNotes() {
    var box = $("notifications");
    box.innerHTML = "";
    game.state.notifications.slice(0, 16).forEach(function (n) {
      var d = document.createElement("div");
      d.className = "note";
      d.textContent = n.text;
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
    box.innerHTML = '<div class="legend">' + ADR.t("stores") + "</div>";
    ADR.ITEMS.forEach(function (k) {
      var n = game.state.stores[k] || 0;
      if (n <= 0 && k !== "wood") return;
      if (k === "wood" && !game.state.wood_initialized) return;
      var row = document.createElement("div");
      row.className = "store-row";
      row.innerHTML = "<span>" + (ADR.ITEM_CN[k] || k) + '</span><span class="n">' + n + "</span>";
      box.appendChild(row);
    });
    if (game.state.buildings.hut > 0 || game.state.population > 0) {
      var pop = document.createElement("div");
      pop.className = "store-row";
      pop.innerHTML = "<span>" + ADR.t("pop ") + '</span><span class="n">' + game.state.population + "</span>";
      box.appendChild(pop);
    }
  }

  function renderRoom() {
    var p = $("panel-room");
    p.innerHTML = "";
    var h = document.createElement("h1");
    h.className = "title";
    h.textContent = ADR.roomTitle(game.state);
    p.appendChild(h);
    var st = document.createElement("div");
    st.className = "status-line";
    st.innerHTML = "房间" + ADR.TEMP[game.state.temperature] + "<br>火堆" + ADR.FIRE[game.state.fire];
    p.appendChild(st);
    var col = document.createElement("div");
    col.className = "btn-col";
    var fireLabel = game.state.fire <= 0 ? ADR.t("light fire") : ADR.t("stoke fire");
    col.appendChild(btn(fireLabel, false, function () {
      game.act(game.state.fire <= 0 ? "light_fire" : "stoke_fire");
    }, "stoke"));
    ADR.Game.prototype.visibleCrafts.call(game).forEach(function (c) {
      var name = { trap: "陷阱", cart: "货车", hut: "小屋" }[c.kind];
      var cost = Object.keys(c.cost).map(function (k) {
        return (ADR.ITEM_CN[k] || k) + c.cost[k];
      }).join(" ");
      col.appendChild(btn(name + " (" + cost + ")", !c.can, function () {
        game.act("build", { kind: c.kind });
      }));
    });
    p.appendChild(col);
    if (game.state.builder_level >= 1 && game.state.builder_level < 4) {
      var hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "角落里有人。把屋子烧暖些。";
      p.appendChild(hint);
    }
  }

  function renderOutside() {
    var p = $("panel-outside");
    p.innerHTML = "";
    var h = document.createElement("h1");
    h.className = "title";
    h.textContent = ADR.hutTitle(game.state.buildings.hut);
    p.appendChild(h);
    var st = document.createElement("div");
    st.className = "status-line";
    st.textContent = game.state.buildings.hut > 0 ? ADR.t("the sky is grey and the wind blows relentlessly") : ADR.t("dry brush and dead branches litter the forest floor");
    p.appendChild(st);
    var col = document.createElement("div");
    col.className = "btn-col";
    col.appendChild(btn(ADR.t("gather wood"), false, function () { game.act("gather_wood"); }, "gather"));
    if (game.state.buildings.trap > 0) {
      col.appendChild(btn(ADR.t("check traps"), false, function () { game.act("check_traps"); }, "traps"));
    }
    p.appendChild(col);
    if (game.state.population > 0) {
      var w = document.createElement("div");
      w.className = "hint";
      w.textContent = "伐木者 " + (game.state.workers.gatherer || 0) + " · " + ADR.t("pop ") + game.state.population;
      p.appendChild(w);
    }
  }

  function renderPath() {
    var p = $("panel-path");
    p.innerHTML = "";
    var h = document.createElement("h1");
    h.className = "title";
    h.textContent = game.state.location === "world" ? ADR.t("A Barren World") : ADR.t("A Dusty Path");
    p.appendChild(h);
    if (game.state.slice_complete) {
      var ban = document.createElement("div");
      ban.id = "slice-banner";
      ban.className = "show";
      ban.textContent = "尘途的第一段已经走完。你可以继续在林中经营，或导出这次试玩的遥测。";
      p.appendChild(ban);
    }
    if (game.state.world.on_expedition) {
      renderWorld(p);
      return;
    }
    var st = document.createElement("div");
    st.className = "status-line";
    st.textContent = ADR.t("the compass points east");
    p.appendChild(st);
    var supplies = document.createElement("div");
    supplies.textContent = ADR.t("supplies:");
    p.appendChild(supplies);
    ["meat", "cured_meat", "fur"].forEach(function (item) {
      var row = document.createElement("div");
      row.className = "pack-row";
      var have = game.state.stores[item] || 0;
      var packed = game.state.outfit[item] || 0;
      row.innerHTML = "<span>" + (ADR.ITEM_CN[item] || item) + " 库存" + have + " / 行装" + packed + "</span>";
      var minus = document.createElement("button");
      minus.textContent = "−";
      minus.addEventListener("click", function () { game.act("pack", { item: item, amount: -1 }); });
      var plus = document.createElement("button");
      plus.textContent = "+";
      plus.addEventListener("click", function () { game.act("pack", { item: item, amount: 1 }); });
      row.appendChild(minus);
      row.appendChild(plus);
      p.appendChild(row);
    });
    var col = document.createElement("div");
    col.className = "btn-col";
    var food = (game.state.outfit.meat || 0) + (game.state.outfit.cured_meat || 0);
    col.appendChild(btn(ADR.t("embark"), food <= 0, function () { game.act("embark"); }));
    p.appendChild(col);
    var hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "带上肉再出发。向东北走，能看见一座旧房子。回到村子格子即可回家。";
    p.appendChild(hint);
  }

  function renderWorld(p) {
    var s = game.state.world;
    var st = document.createElement("div");
    st.className = "status-line";
    st.textContent = "生命 " + s.hp + "/" + s.max_hp + "  ·  水 " + s.water + "  ·  肉 " + ((game.state.outfit.meat || 0) + (game.state.outfit.cured_meat || 0));
    p.appendChild(st);
    var map = document.createElement("div");
    map.id = "world-map";
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
    p.appendChild(map);
    var pad = document.createElement("div");
    pad.className = "btn-col";
    [["北", 0, -1], ["西", -1, 0], ["东", 1, 0], ["南", 0, 1]].forEach(function (d) {
      pad.appendChild(btn(d[0], false, function () { game.act("world_move", { dx: d[1], dy: d[2] }); }));
    });
    p.appendChild(pad);
    var hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "WASD 或方向键移动。H 是旧房子，A 是村落。";
    p.appendChild(hint);
  }

  function renderEvent() {
    var ov = $("overlay");
    var ev = game.state.active_event;
    var combat = game.state.combat;
    if (!ev && !combat) {
      ov.className = "";
      ov.innerHTML = "";
      return;
    }
    ov.className = "show";
    ov.innerHTML = "";
    var modal = document.createElement("div");
    modal.className = "modal";
    if (combat) {
      modal.innerHTML = "<h2>" + combat.name + "</h2><div class='body'><p>一只野兽从灌木丛里蹿了出来。</p><p>野兽生命 " + combat.hp + " · 你 " + game.state.world.hp + "</p></div>";
      var acts = document.createElement("div");
      acts.className = "modal-actions";
      acts.appendChild(btn("挥拳", false, function () { game.act("combat", { move: "punch" }); }));
      acts.appendChild(btn("逃跑", false, function () { game.act("combat", { move: "flee" }); }));
      modal.appendChild(acts);
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
      acts.appendChild(btn(label, disabled, function () { game.act("event_choice", { button: b.id }); }));
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
  }

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.className = "show";
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
      "<label>遥测 HTTP 端点（可选，如 Supabase REST）</label>" +
      "<input id='cfg-an' placeholder='https://xxx.supabase.co/rest/v1/playtest_events' />" +
      "<label>遥测 apikey / Authorization（可选）</label>" +
      "<input id='cfg-an-key' type='password' autocomplete='off' />" +
      "<label>时间倍率</label>" +
      "<select id='cfg-scale'><option value='1'>原速</option><option value='2'>加速 ×2</option><option value='4'>试玩 ×4</option></select>" +
      "</form>";
    var acts = document.createElement("div");
    acts.className = "modal-actions";
    acts.appendChild(btn("保存", false, function () {
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
      toast("已保存");
    }));
    acts.appendChild(btn("关闭", false, function () { ov.className = ""; }));
    modal.appendChild(acts);
    ov.appendChild(modal);
    $("cfg-director").value = game.directorName;
    $("cfg-llm").value = game.config.llm_endpoint || "";
    $("cfg-an").value = game.analytics.httpEndpoint || "";
    $("cfg-scale").value = String(game.timeScale === 4 ? 4 : game.timeScale === 2 ? 2 : 1);
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
    window.addEventListener("beforeunload", function () {
      game.act("quit");
    });
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
    if (q.get("fast") === "1" || q.get("fast") === "true") cfg.time_scale = 10;
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
      game.on(renderAll);
      bindMenu();
      renderAll();
      requestAnimationFrame(loop);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
