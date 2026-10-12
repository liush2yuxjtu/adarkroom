/* Browser-side playtest telemetry: batch, throttle, never block the game loop.
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function (root) {
  "use strict";

  var FLUSH_MS = 3000;
  var FLUSH_N = 15;
  var SESSION_CAP = 2500;
  var MOUSE_MS = 300;
  var MOUSE_BATCH = 6;
  var SCROLL_MS = 400;
  var HOVER_SOURCE_MS = 400;
  var VIS_DEDUP_MS = 500;
  var LS_KEY = "adr.telemetry";
  var UNLOAD_KEY = "adr.last_unload";
  var DEBUG_LS = "adr.telemetry_debug";
  var EVENT_LEVEL = { director_think: "debug" };
  var persistTimer = 0;
  var flushTimer = 0;
  var startedAt = Date.now();

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function navEntry() {
    try {
      if (typeof performance !== "undefined" && performance.getEntriesByType) {
        var list = performance.getEntriesByType("navigation");
        if (list && list[0]) return list[0];
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function clamp01(n) {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return Math.round(n * 10000) / 10000;
  }

  function safeJsonParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function storageGet(key) {
    var v = null;
    try { if (typeof sessionStorage !== "undefined") v = sessionStorage.getItem(key); } catch (e) { /* ignore */ }
    if (v) return v;
    try { if (typeof localStorage !== "undefined") v = localStorage.getItem(key); } catch (e) { /* ignore */ }
    return v;
  }

  function storageSet(key, value) {
    try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
    try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  var T = {
    sessionId: uuid(),
    buffer: [],
    queue: [],
    sent: 0,
    dropped: 0,
    capped: false,
    lastAction: null,
    lastActionAt: 0,
    visible: typeof document === "undefined" || document.visibilityState !== "hidden",
    visibleSince: Date.now(),
    activePlayMs: 0,
    hiddenAt: 0,
    lastVisEventAt: 0,
    lastVisName: "",
    mouseBuf: [],
    lastMouseAt: 0,
    lastMouse: null,
    moving: false,
    hovers: {},
    lastScrollAt: 0,
    firstFrameAt: 0,
    loadLogged: false,
    jsErrors: 0,
    unloadSent: false,
    game: null,
    url: "",
    anonKey: "",
    sink: null
  };

  function cfg() {
    return (typeof root.ADR_TELEMETRY === "object" && root.ADR_TELEMETRY) || {};
  }

  function sinkApi() {
    return T.sink || (typeof root.ADRSupabaseSink === "object" ? root.ADRSupabaseSink : null);
  }

  function gameSnap() {
    var g = T.game;
    var s = g && g.state;
    if (!s) {
      return {
        session_id: T.sessionId,
        game_time_sec: 0,
        phase: "",
        stores: {},
        buildings: {},
        fire: 0,
        population: 0
      };
    }
    return {
      session_id: s.session_id || T.sessionId,
      game_time_sec: Math.round((s.game_time_sec || 0) * 100) / 100,
      phase: s.phase || "",
      stores: s.stores ? JSON.parse(JSON.stringify(s.stores)) : {},
      buildings: s.buildings ? JSON.parse(JSON.stringify(s.buildings)) : {},
      fire: s.fire,
      population: s.population
    };
  }

  function accrueVisible() {
    if (T.visible) {
      T.activePlayMs += Date.now() - T.visibleSince;
      T.visibleSince = Date.now();
    }
  }

  function activePlayMs() {
    var n = T.activePlayMs;
    if (T.visible) n += Date.now() - T.visibleSince;
    return n;
  }

  function persistNow() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = 0;
    }
    if (typeof localStorage === "undefined") return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(T.buffer.slice(-800))); } catch (e) { /* ignore */ }
  }

  function persistSoon() {
    if (persistTimer) return;
    persistTimer = setTimeout(persistNow, 1500);
  }

  function debugEnabled() {
    try {
      if (typeof location !== "undefined" && location.search) {
        var q = new URLSearchParams(location.search);
        var v = q.get("telemetry_debug");
        if (v === "1" || v === "true") return true;
        if (v === "0" || v === "false") return false;
      }
    } catch (e) { /* ignore */ }
    try {
      if (typeof localStorage !== "undefined") {
        var ls = localStorage.getItem(DEBUG_LS);
        if (ls === "1" || ls === "true") return true;
        if (ls === "0" || ls === "false") return false;
      }
    } catch (e2) { /* ignore */ }
    var boot = cfg();
    if (boot.debug === true || boot.debug === 1 || boot.debug === "1") return true;
    var g = T.game;
    if (g && g.config && (g.config.telemetry_debug === true || g.config.telemetry_debug === 1)) return true;
    return false;
  }

  function levelOf(name, explicit) {
    if (explicit) return explicit;
    return EVENT_LEVEL[name] || "info";
  }

  function enqueueRow(row, opts) {
    opts = opts || {};
    T.buffer.push(row);
    if (T.buffer.length > 800) T.buffer = T.buffer.slice(-800);
    persistSoon();
    if (opts.skipHttp) return;
    if (!T.url || !T.anonKey) return;
    T.queue.push(row);
    if (T.queue.length >= FLUSH_N) flush("count");
  }

  function log(name, payload, level) {
    level = levelOf(name, level);
    var debugOn = debugEnabled();
    if (level === "debug" && !debugOn) {
      if (typeof console !== "undefined" && console.debug) {
        console.debug("[adr:debug]", name, payload || {});
      }
      return null;
    }
    if (T.capped && name !== "page_unload" && name !== "page_reload" && name !== "js_error" && name !== "session_end") {
      T.dropped += 1;
      return null;
    }
    if (T.sent + T.queue.length + T.buffer.length >= SESSION_CAP && name !== "page_unload") {
      T.capped = true;
      if (name !== "session_end" && name !== "js_error" && name !== "page_reload") {
        T.dropped += 1;
        return null;
      }
    }
    var snap = gameSnap();
    var ev = {
      session_id: snap.session_id,
      event_name: name,
      occurred_at: nowIso(),
      game_time_sec: snap.game_time_sec,
      phase: snap.phase,
      payload: payload || {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "godot"
    };
    enqueueRow(ev, { skipHttp: level === "debug" && !debugOn });
    return ev;
  }

  function beaconUrl() {
    if (!T.url || !T.anonKey) return "";
    var sep = T.url.indexOf("?") >= 0 ? "&" : "?";
    return T.url + sep + "apikey=" + encodeURIComponent(T.anonKey);
  }

  function flush(reason) {
    if (!T.queue.length || !T.url || !T.anonKey) return;
    var sink = sinkApi();
    var rows = T.queue.splice(0, 200).map(function (ev) {
      return sink && sink.rowFromEvent ? sink.rowFromEvent(ev) : {
        session_id: ev.session_id,
        event_name: ev.event_name,
        occurred_at: ev.occurred_at,
        game_time_sec: ev.game_time_sec,
        phase: ev.phase,
        payload: ev.payload || {},
        user_agent: ev.user_agent || ""
      };
    });
    T.sent += rows.length;
    var body = JSON.stringify(rows);
    var unloading = reason === "unload" || reason === "pagehide" || reason === "beforeunload";
    var headers = sink && sink.headersFromAnonKey
      ? sink.headersFromAnonKey(T.anonKey)
      : { "Content-Type": "application/json", apikey: T.anonKey, Authorization: "Bearer " + T.anonKey, Prefer: "return=minimal" };
    if (typeof fetch === "function") {
      fetch(T.url, {
        method: "POST",
        keepalive: true,
        headers: headers,
        body: body
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
      }).catch(function () {
        if (unloading && typeof navigator !== "undefined" && navigator.sendBeacon) {
          try { navigator.sendBeacon(beaconUrl(), new Blob([body], { type: "application/json" })); } catch (e) { /* ignore */ }
        }
        for (var j = rows.length - 1; j >= 0; j--) T.queue.unshift(rows[j]);
        T.sent -= rows.length;
      });
      return;
    }
    if (unloading && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(beaconUrl(), new Blob([body], { type: "application/json" }))) return;
      } catch (e2) { /* ignore */ }
    }
    for (var i = rows.length - 1; i >= 0; i--) T.queue.unshift(rows[i]);
    T.sent -= rows.length;
  }

  function flushMouse(why) {
    if (!T.mouseBuf.length) return;
    var samples = T.mouseBuf.splice(0, 40);
    log("mouse_trajectory", {
      samples: samples,
      reason: why || "batch",
      n: samples.length
    });
  }

  function sampleMouse(ev) {
    var t = Date.now();
    if (t - T.lastMouseAt < MOUSE_MS) {
      T.moving = true;
      return;
    }
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    T.lastMouseAt = t;
    T.moving = true;
    T.lastMouse = { x: ev.clientX, y: ev.clientY };
    T.mouseBuf.push({
      t: t - startedAt,
      x: ev.clientX,
      y: ev.clientY,
      nx: clamp01(ev.clientX / w),
      ny: clamp01(ev.clientY / h)
    });
    if (T.mouseBuf.length >= MOUSE_BATCH) flushMouse("full");
  }

  function elementId(el) {
    if (!el || !el.getAttribute) return "";
    return el.getAttribute("data-key") || el.getAttribute("data-tab") || el.id || el.getAttribute("name") || "";
  }

  function elementLabel(el) {
    if (!el) return "";
    var lab = el.querySelector && el.querySelector(".btn-label");
    var text = (lab && lab.textContent) || el.textContent || "";
    return String(text).replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function closestCtl(el) {
    var n = el;
    while (n && n !== document && n !== document.body) {
      if (n.tagName === "BUTTON" || n.tagName === "A" || (n.getAttribute && (n.getAttribute("data-key") || n.getAttribute("data-tab")))) {
        return n;
      }
      n = n.parentNode;
    }
    return el && el.tagName ? el : null;
  }

  function onVisibility(source, hidden) {
    var t = Date.now();
    if (T.lastVisName === (hidden ? "tab_hidden" : "tab_visible") && t - T.lastVisEventAt < VIS_DEDUP_MS) return;
    T.lastVisEventAt = t;
    T.lastVisName = hidden ? "tab_hidden" : "tab_visible";
    if (hidden) {
      accrueVisible();
      T.visible = false;
      T.hiddenAt = t;
      flushMouse("hidden");
      log("tab_hidden", {
        source: source,
        hidden_at: nowIso(),
        active_play_ms: T.activePlayMs,
        last_hidden_ms: 0
      });
      flush("hidden");
    } else {
      var hidMs = T.hiddenAt ? t - T.hiddenAt : 0;
      T.visible = true;
      T.visibleSince = t;
      log("tab_visible", {
        source: source,
        visible_at: nowIso(),
        last_hidden_ms: hidMs,
        active_play_ms: activePlayMs()
      });
    }
  }

  function pageUnload(reason) {
    if (T.unloadSent) return;
    T.unloadSent = true;
    accrueVisible();
    flushMouse("unload");
    var snap = gameSnap();
    var rec = {
      session_id: snap.session_id,
      unloaded_at: Date.now(),
      phase: snap.phase,
      stores: snap.stores,
      buildings: snap.buildings,
      fire: snap.fire,
      population: snap.population,
      game_time_sec: snap.game_time_sec,
      active_play_ms: T.activePlayMs,
      last_action: T.lastAction
    };
    storageSet(UNLOAD_KEY, JSON.stringify(rec));
    persistNow();
    log("page_unload", {
      reason: reason || "pagehide",
      phase: snap.phase,
      stores: snap.stores,
      buildings: snap.buildings,
      fire: snap.fire,
      population: snap.population,
      game_time_sec: snap.game_time_sec,
      active_play_ms: T.activePlayMs,
      last_action: T.lastAction
    });
    persistNow();
    flush("unload");
  }

  function detectReload() {
    var nav = navEntry();
    var type = nav ? nav.type : (typeof performance !== "undefined" && performance.navigation ? ({ 0: "navigate", 1: "reload", 2: "back_forward" }[performance.navigation.type] || "navigate") : "navigate");
    var prev = safeJsonParse(storageGet(UNLOAD_KEY));
    if (type === "reload" && prev && prev.session_id) {
      T.pendingReload = {
        previous_session_id: prev.session_id,
        time_since_unload_ms: prev.unloaded_at ? Date.now() - prev.unloaded_at : null,
        nav_type: type,
        previous_phase: prev.phase || "",
        previous_game_time_sec: prev.game_time_sec || 0,
        previous_last_action: prev.last_action || null
      };
    }
    return type;
  }

  function markFirstFrame() {
    if (T.firstFrameAt) return;
    T.firstFrameAt = Date.now();
    if (T.loadLogged) return;
    T.loadLogged = true;
    var nav = navEntry();
    var wasmMs = null;
    var pckMs = null;
    var scripts = [];
    try {
      if (performance.getEntriesByType) {
        performance.getEntriesByType("resource").forEach(function (r) {
          var name = String(r.name || "");
          var dur = Math.round(r.duration);
          if (/\.wasm(\?|$)/i.test(name)) wasmMs = dur;
          if (/\.pck(\?|$)/i.test(name)) pckMs = dur;
          if (/\/(engine|ui|telemetry|adr\.css)/.test(name)) {
            scripts.push({ name: name.split("/").pop().split("?")[0], duration_ms: dur });
          }
        });
      }
    } catch (e) { /* ignore */ }
    log("load_performance", {
      nav_type: nav ? nav.type : "unknown",
      dns_ms: nav ? Math.round(nav.domainLookupEnd - nav.domainLookupStart) : null,
      connect_ms: nav ? Math.round(nav.connectEnd - nav.connectStart) : null,
      ttfb_ms: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
      dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load_event_ms: nav ? Math.round(nav.loadEventEnd) : null,
      time_to_first_frame_ms: T.firstFrameAt - startedAt,
      wasm_ms: wasmMs,
      pck_ms: pckMs,
      runtime: wasmMs != null ? "godot-wasm" : "html",
      scripts: scripts
    });
  }

  function playTone(name, opts) {
    opts = opts || {};
    var started = Date.now();
    var ctx = null;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (AC) {
        if (!T._ac) T._ac = new AC();
        ctx = T._ac;
        if (ctx.state === "suspended" && ctx.resume) ctx.resume();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = opts.type || "square";
        osc.frequency.value = opts.freq || 220;
        gain.gain.value = opts.gain == null ? 0.03 : opts.gain;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (opts.sec || 0.07));
      }
    } catch (e) { /* ignore audio failures */ }
    log("audio_play", {
      name: name,
      src: opts.src || "webaudio",
      freq: opts.freq || 220,
      duration_ms: Math.round((opts.sec || 0.07) * 1000),
      context_state: ctx ? ctx.state : "unavailable",
      started_at: started
    });
  }

  function noteLastAction(action, args) {
    T.lastAction = { action: action, args: args || {}, at: nowIso() };
    T.lastActionAt = Date.now();
  }

  function attachSink() {
    var c = cfg();
    T.url = c.url || "";
    T.anonKey = c.anonKey || "";
    T.sink = sinkApi();
  }

  function bindGame(game) {
    T.game = game;
    if (game && game.state && game.state.session_id) T.sessionId = game.state.session_id;
    if (T.pendingReload) {
      var info = T.pendingReload;
      T.pendingReload = null;
      log("page_reload", info);
    }
  }

  function rotateSession() {
    T.sessionId = uuid();
    T.capped = false;
    T.dropped = 0;
    return T.sessionId;
  }

  function attachBrowser() {
    attachSink();
    detectReload();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", function () {
        onVisibility("visibilitychange", document.visibilityState === "hidden");
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("blur", function () { onVisibility("window_blur", true); });
      window.addEventListener("focus", function () { onVisibility("window_focus", false); });
      window.addEventListener("pagehide", function () { pageUnload("pagehide"); });
      window.addEventListener("beforeunload", function () { pageUnload("beforeunload"); });
      window.addEventListener("mousemove", function (e) { sampleMouse(e); }, { passive: true });
      window.addEventListener("mouseout", function (e) {
        if (!e.relatedTarget) {
          T.moving = false;
          flushMouse("stop");
        }
      });
      setInterval(function () {
        if (!T.moving) flushMouse("idle");
        T.moving = false;
      }, 1200);
      window.addEventListener("click", function (e) {
        var el = closestCtl(e.target);
        var w = window.innerWidth || 1;
        var h = window.innerHeight || 1;
        log("click_heat", {
          x: e.clientX,
          y: e.clientY,
          nx: clamp01(e.clientX / w),
          ny: clamp01(e.clientY / h),
          element_id: elementId(el) || (el && el.id) || "",
          tag: el ? String(el.tagName || "").toLowerCase() : "",
          label: elementLabel(el)
        });
      }, true);
      window.addEventListener("mouseover", function (e) {
        var el = closestCtl(e.target);
        if (!el || (el.tagName !== "BUTTON" && !elementId(el))) return;
        var id = elementId(el) || elementLabel(el) || el.tagName;
        if (T.hovers[id]) return;
        T.hovers[id] = { at: Date.now(), id: id, label: elementLabel(el) };
        log("button_hover_enter", { element_id: id, label: elementLabel(el) });
      }, true);
      window.addEventListener("mouseout", function (e) {
        var el = closestCtl(e.target);
        if (!el) return;
        var related = closestCtl(e.relatedTarget);
        if (related === el) return;
        var id = elementId(el) || elementLabel(el) || el.tagName;
        var rec = T.hovers[id];
        if (!rec) return;
        delete T.hovers[id];
        var dur = Date.now() - rec.at;
        if (dur < 20) return;
        log("button_hover_exit", { element_id: id, label: rec.label, duration_ms: dur });
      }, true);
      var onScroll = function (e) {
        var t = Date.now();
        if (t - T.lastScrollAt < SCROLL_MS) return;
        T.lastScrollAt = t;
        var src = e && e.target && e.target.id ? e.target.id : "window";
        var se = e && e.target && e.target.scrollTop != null ? e.target : document.documentElement;
        log("scroll", {
          source: src,
          scroll_x: window.scrollX || 0,
          scroll_y: window.scrollY || 0,
          scroll_max_x: Math.max(0, (document.documentElement.scrollWidth || 0) - (window.innerWidth || 0)),
          scroll_max_y: Math.max(0, (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0)),
          target_scroll_top: se && se.scrollTop || 0,
          target_scroll_left: se && se.scrollLeft || 0
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true, capture: true });
      window.onerror = function (message, source, line, col, err) {
        if (T.jsErrors >= 20) return;
        T.jsErrors += 1;
        log("js_error", {
          type: "onerror",
          message: String(message || ""),
          source: String(source || ""),
          line: line || 0,
          col: col || 0,
          stack: err && err.stack ? String(err.stack).slice(0, 800) : ""
        });
      };
      window.addEventListener("unhandledrejection", function (e) {
        if (T.jsErrors >= 20) return;
        T.jsErrors += 1;
        var reason = e && e.reason;
        log("js_error", {
          type: "unhandledrejection",
          message: reason && reason.message ? String(reason.message) : String(reason || "rejection"),
          stack: reason && reason.stack ? String(reason.stack).slice(0, 800) : ""
        });
      });
    }

    if (typeof setInterval === "function") {
      flushTimer = setInterval(function () { flush("interval"); }, FLUSH_MS);
    }
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () { markFirstFrame(); });
    } else {
      setTimeout(markFirstFrame, 0);
    }
  }

  function logFromGodot(name, payloadJson) {
    var payload = {};
    if (typeof payloadJson === "string" && payloadJson) {
      var parsed = safeJsonParse(payloadJson);
      if (parsed && typeof parsed === "object") payload = parsed;
    } else if (payloadJson && typeof payloadJson === "object") {
      payload = payloadJson;
    }
    return log(name, payload);
  }

  root.ADRTelemetry = {
    log: log,
    flush: flush,
    attach: attachBrowser,
    attachSink: attachSink,
    bindGame: bindGame,
    rotateSession: rotateSession,
    sessionId: function () { return T.sessionId; },
    setSessionId: function (id) { if (id) T.sessionId = id; return T.sessionId; },
    ensureSessionId: function () { return T.sessionId; },
    markFirstFrame: markFirstFrame,
    playTone: playTone,
    noteLastAction: noteLastAction,
    pageUnload: pageUnload,
    logFromGodot: logFromGodot,
    debugEnabled: debugEnabled,
    EVENT_LEVEL: EVENT_LEVEL,
    activePlayMs: activePlayMs,
    exportJson: function () { return JSON.stringify(T.buffer, null, 2); },
    buffer: T.buffer,
    _state: T
  };

  if (typeof document !== "undefined") attachBrowser();
})(typeof self !== "undefined" ? self : this);
