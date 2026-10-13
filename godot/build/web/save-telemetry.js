/* Observe the remake save system — do not persist game state here.
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function (root) {
  "use strict";

  var BACKUP_PREFIX = "adr.save.corrupt.";
  var watchedKeys = {};
  var lastMeta = null;
  var hooked = false;
  var wrapping = false;

  function tel() {
    return typeof root.ADRTelemetry !== "undefined" ? root.ADRTelemetry : null;
  }

  function log(name, payload) {
    var t = tel();
    if (t && t.log) return t.log(name, payload);
    return null;
  }

  function checksum(str) {
    var s = String(str || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function byteSize(str) {
    try {
      return new Blob([str]).size;
    } catch (e) {
      return String(str || "").length;
    }
  }

  function game() {
    if (root.__ADR_GAME) return root.__ADR_GAME;
    var t = tel();
    return (t && t._state && t._state.game) || null;
  }

  function snapshotFromState(state) {
    state = state || (game() && game().state) || {};
    return {
      save_id: state.save_id || (lastMeta && lastMeta.save_id) || null,
      save_version: state.save_version || (lastMeta && lastMeta.save_version) || 1,
      phase: state.phase || "",
      resources: state.stores ? JSON.parse(JSON.stringify(state.stores)) : {},
      buildings: state.buildings ? JSON.parse(JSON.stringify(state.buildings)) : {},
      fire: state.fire,
      population: state.population,
      play_time_sec: Math.round((state.game_time_sec || 0) * 100) / 100,
      last_action: (game() && game().analytics && game().analytics.recentActions && game().analytics.recentActions.slice(-1)[0]) || (tel() && tel()._state && tel()._state.lastAction) || null
    };
  }

  function remember(meta) {
    lastMeta = meta;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("adr.last_save_meta", JSON.stringify(meta));
      }
    } catch (e) { /* ignore */ }
    return meta;
  }

  function previousSaveContext() {
    if (lastMeta) return lastMeta;
    try {
      if (typeof sessionStorage !== "undefined") {
        var raw = sessionStorage.getItem("adr.last_save_meta");
        if (raw) lastMeta = JSON.parse(raw);
      }
    } catch (e) { /* ignore */ }
    return lastMeta;
  }

  function backupCorrupt(raw, reason) {
    var key = BACKUP_PREFIX + Date.now();
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, typeof raw === "string" ? raw : JSON.stringify(raw));
      }
    } catch (e) { /* quota */ }
    return key;
  }

  function validateBlob(raw, opts) {
    opts = opts || {};
    if (raw == null || raw === "") return { ok: false, reason: "empty" };
    var text = typeof raw === "string" ? raw : null;
    var obj = raw;
    if (typeof raw === "string") {
      try { obj = JSON.parse(raw); } catch (e) {
        return { ok: false, reason: "json", error: String(e && e.message || e) };
      }
    }
    if (!obj || typeof obj !== "object") return { ok: false, reason: "not_object" };
    var ver = obj.save_version != null ? obj.save_version : obj.version;
    if (ver != null && opts.maxVersion != null && Number(ver) > Number(opts.maxVersion)) {
      return { ok: false, reason: "version", save_version: ver };
    }
    if (opts.require && opts.require.length) {
      for (var i = 0; i < opts.require.length; i++) {
        if (!(opts.require[i] in obj) && !(obj.state && opts.require[i] in obj.state)) {
          return { ok: false, reason: "schema", missing: opts.require[i] };
        }
      }
    }
    if (obj.checksum && text) {
      var copy;
      try { copy = JSON.parse(text); } catch (e2) { copy = null; }
      if (copy) {
        delete copy.checksum;
        var got = checksum(JSON.stringify(copy));
        if (obj.checksum && got !== obj.checksum) {
          return { ok: false, reason: "checksum", expected: obj.checksum, got: got };
        }
      }
    }
    return { ok: true, value: obj, size: byteSize(text || JSON.stringify(obj)), checksum: checksum(text || JSON.stringify(obj)) };
  }

  function onSaveWrite(info) {
    info = info || {};
    var snap = snapshotFromState(info.state);
    var meta = remember({
      save_id: info.save_id || snap.save_id,
      save_version: info.save_version != null ? info.save_version : snap.save_version,
      phase: snap.phase,
      play_time_sec: snap.play_time_sec,
      last_action: snap.last_action,
      saved_at: new Date().toISOString(),
      backend: info.backend || "localStorage",
      size: info.size || 0
    });
    log("save_write", {
      save_id: meta.save_id,
      save_version: meta.save_version,
      phase: snap.phase,
      resources: snap.resources,
      buildings: snap.buildings,
      fire: snap.fire,
      population: snap.population,
      play_time_sec: snap.play_time_sec,
      write_ms: info.write_ms != null ? info.write_ms : 0,
      backend: meta.backend,
      size: info.size || 0,
      checksum: info.checksum || null
    });
    return meta;
  }

  function onSaveLoad(info) {
    info = info || {};
    log("save_load", {
      ok: info.ok !== false,
      backend: info.backend || "localStorage",
      error: info.error || null,
      size: info.size || 0,
      save_id: info.save_id || null,
      save_version: info.save_version != null ? info.save_version : null,
      checksum: info.checksum || null
    });
    if (info.ok !== false && info.save_id) {
      remember({
        save_id: info.save_id,
        save_version: info.save_version,
        phase: info.phase || "",
        play_time_sec: info.play_time_sec || 0,
        last_action: info.last_action || null,
        saved_at: info.saved_at || new Date().toISOString(),
        backend: info.backend || "localStorage",
        size: info.size || 0
      });
    }
  }

  function onSaveCorrupt(info) {
    info = info || {};
    var backupKey = info.backup_key || backupCorrupt(info.raw, info.reason);
    log("save_corrupt", {
      reason: info.reason || "unknown",
      backend: info.backend || "localStorage",
      error: info.error || null,
      size: info.size || (info.raw != null ? byteSize(typeof info.raw === "string" ? info.raw : JSON.stringify(info.raw)) : 0),
      backup_key: backupKey,
      save_id: info.save_id || null
    });
    log("save_recover", {
      reason: info.reason || "unknown",
      recovered: true,
      fallback: info.fallback || "new_game",
      error: info.error || null,
      save_id: info.save_id || null
    });
    return backupKey;
  }

  function onNewGame(info) {
    info = info || {};
    var prev = previousSaveContext();
    var g = game();
    var recent = g && g.analytics ? g.analytics.recentActions.slice() : [];
    log("new_game_start", {
      overwritten: info.overwritten !== false && !!prev,
      previous_save_id: prev && prev.save_id || null,
      previous_phase: prev && prev.phase || null,
      previous_play_time_sec: prev && prev.play_time_sec || null,
      previous_last_action: prev && prev.last_action || (recent.length ? recent[recent.length - 1] : null),
      previous_last_save_at: prev && prev.saved_at || null,
      recent_actions: recent,
      last_phase: (g && g.state && g.state.phase) || (prev && prev.phase) || ""
    });
  }

  function wrapFn(obj, name, kind) {
    if (!obj || typeof obj[name] !== "function") return false;
    if (obj[name]._adrTelWrapped) return true;
    var orig = obj[name];
    var wrapped = function () {
      var args = arguments;
      var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      var backend = "localStorage";
      try {
        var ret = orig.apply(this, args);
        var finish = function (value) {
          var ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
          if (kind === "write") {
            var raw = typeof value === "string" ? value : (value && value.raw) || null;
            onSaveWrite({
              save_id: (value && value.save_id) || (this && this.state && this.state.save_id),
              save_version: (value && value.save_version) || (this && this.state && this.state.save_version),
              write_ms: Math.round(ms * 100) / 100,
              backend: (value && value.backend) || backend,
              size: raw != null ? byteSize(raw) : (value && value.size) || 0,
              checksum: raw != null ? checksum(raw) : null,
              state: this && this.state
            });
          } else if (kind === "load") {
            if (value && value.corrupt) {
              onSaveCorrupt({
                reason: value.reason || "integrity",
                raw: value.raw,
                backend: value.backend || backend,
                error: value.error,
                save_id: value.save_id
              });
            }
            onSaveLoad({
              ok: !!(value && (value.ok !== false) && !value.corrupt),
              backend: (value && value.backend) || backend,
              error: value && value.error,
              size: value && value.size || 0,
              save_id: value && value.save_id,
              save_version: value && value.save_version,
              checksum: value && value.checksum,
              phase: value && value.phase,
              play_time_sec: value && value.play_time_sec
            });
          }
          return value;
        };
        if (ret && typeof ret.then === "function") return ret.then(finish);
        return finish(ret);
      } catch (err) {
        if (kind === "load") {
          onSaveLoad({ ok: false, backend: backend, error: String(err && err.message || err) });
        } else if (kind === "write") {
          onSaveWrite({ write_ms: 0, backend: backend, size: 0 });
        }
        throw err;
      }
    };
    wrapped._adrTelWrapped = true;
    obj[name] = wrapped;
    return true;
  }

  function watchKey(key) {
    if (!key) return;
    watchedKeys[key] = true;
  }

  function installStorageObserver() {
    if (typeof Storage === "undefined" || Storage.prototype.setItem._adrTelWrapped) return;
    var setItem = Storage.prototype.setItem;
    var getItem = Storage.prototype.getItem;
    Storage.prototype.setItem = function (key, value) {
      var ret = setItem.apply(this, arguments);
      if (wrapping || !watchedKeys[key]) return ret;
      wrapping = true;
      try {
        var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        var raw = String(value);
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        onSaveWrite({
          save_id: parsed && (parsed.save_id || (parsed.state && parsed.state.save_id)),
          save_version: parsed && (parsed.save_version || parsed.version),
          write_ms: Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 100) / 100,
          backend: this === (typeof localStorage !== "undefined" ? localStorage : this) ? "localStorage" : "sessionStorage",
          size: byteSize(raw),
          checksum: checksum(raw)
        });
      } finally {
        wrapping = false;
      }
      return ret;
    };
    Storage.prototype.setItem._adrTelWrapped = true;
    Storage.prototype.getItem = function (key) {
      var raw = getItem.apply(this, arguments);
      if (wrapping || !watchedKeys[key] || raw == null) return raw;
      wrapping = true;
      try {
        var check = validateBlob(raw, { require: [] });
        if (!check.ok) {
          onSaveCorrupt({ reason: check.reason, raw: raw, backend: "localStorage", error: check.error });
          onSaveLoad({ ok: false, backend: "localStorage", error: check.reason, size: byteSize(raw) });
        }
      } finally {
        wrapping = false;
      }
      return raw;
    };
    Storage.prototype.getItem._adrTelWrapped = true;
  }

  function hookGame(g) {
    if (!g) return false;
    var n = 0;
    ["save", "autosave"].forEach(function (name) {
      if (wrapFn(g, name, "write")) n += 1;
    });
    ["load", "restore", "readSave", "loadSave"].forEach(function (name) {
      if (wrapFn(g, name, "load")) n += 1;
    });
    if (g.saveSystem) {
      if (wrapFn(g.saveSystem, "write", "write")) n += 1;
      if (wrapFn(g.saveSystem, "read", "load")) n += 1;
      if (wrapFn(g.saveSystem, "load", "load")) n += 1;
    }
    var Save = (root.ADR && root.ADR.Save) || root.ADRSave;
    if (Save) {
      ["write", "save", "persist"].forEach(function (name) { if (wrapFn(Save, name, "write")) n += 1; });
      ["read", "load", "restore"].forEach(function (name) { if (wrapFn(Save, name, "load")) n += 1; });
      if (Save.STORAGE_KEY) watchKey(Save.STORAGE_KEY);
      if (Save.key) watchKey(Save.key);
    }
    installStorageObserver();
    hooked = true;
    return n > 0;
  }

  function hookKnownKeys(keys) {
    (keys || []).forEach(watchKey);
    installStorageObserver();
  }


  /* ===================== save_snapshot =====================
   * PRIVACY / PURPOSE: save_snapshot uploads a sanitized copy of the adr.save.v1 game
   * state ONLY so we can analyze player behavior (pacing, progression, where players get
   * stuck or quit). It is used for nothing else: no ads, no profiling, no resale, no
   * identity linking. It carries no personal info: only game state + the existing anonymous
   * session id. Opt out: ?telemetry=0, localStorage adr.telemetry_optout=1, or
   * ADR_TELEMETRY.save_snapshot === false. Rows go through the existing playtest_events
   * channel (payload.save_data jsonb, no schema change).
   */
  var SNAP_SCHEMA = 1;
  var SNAP_MAX_CHARS = 12000; /* RLS: pg_column_size(payload) < 16384 */
  var SAVE_THROTTLE_MS = 60000;
  var PII_KEY = /(^|_)(nick(name)?|e?mail|display_?name|user_?name|player_?name|real_?name|name|phone|ip|ip_addr|address|user_?agent|ua|device|fingerprint|screen|timezone|tz|locale|lang|token|api_?key|apikey|anon_?key|authorization|llm_endpoint|endpoint|url|headers)$/i;
  var DROP_FOR_SIZE = ["notifications", "scheduled", "active_event", "goal"];
  var snapState = { lastAt: 0, lastSaveTrigAt: 0, onExp: null, timer: 0, count: 0 };

  function snapCfg() {
    var c = (typeof root.ADR_TELEMETRY === "object" && root.ADR_TELEMETRY) || {};
    var g = game();
    var gc = (g && g.config) || {};
    var min = Number(c.save_snapshot_minutes || gc.save_snapshot_minutes || 5);
    if (!(min > 0)) min = 5;
    return { intervalMs: min * 60000, minutes: min };
  }

  function optedOut() {
    try {
      var c = (typeof root.ADR_TELEMETRY === "object" && root.ADR_TELEMETRY) || {};
      if (c.save_snapshot === false || c.optOut === true) return true;
      if (typeof location !== "undefined" && location.search) {
        var q = new URLSearchParams(location.search);
        var v = q.get("telemetry");
        if (v === "0" || v === "false" || v === "off") return true;
      }
      if (typeof localStorage !== "undefined") {
        var o = localStorage.getItem("adr.telemetry_optout");
        if (o === "1" || o === "true") return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function sanitize(v, depth) {
    if (depth > 12) return null;
    if (Array.isArray(v)) return v.slice(0, 200).map(function (x) { return sanitize(x, depth + 1); });
    if (v && typeof v === "object") {
      var out = {};
      Object.keys(v).forEach(function (k) {
        if (PII_KEY.test(k)) return;
        out[k] = sanitize(v[k], depth + 1);
      });
      return out;
    }
    if (typeof v === "string") {
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(v)) return "[redacted]";
      return v.length > 200 ? v.slice(0, 200) : v;
    }
    if (typeof v === "number" && !isFinite(v)) return null;
    return v;
  }

  /* Shrink until under the cap: drop free-text/log arrays, then compact visited map, then truncate. */
  function fitSize(st) {
    var info = { truncated: false, dropped: [] };
    var json = JSON.stringify(st);
    for (var i = 0; i < DROP_FOR_SIZE.length && json.length > SNAP_MAX_CHARS; i++) {
      if (st[DROP_FOR_SIZE[i]] !== undefined) {
        delete st[DROP_FOR_SIZE[i]];
        info.dropped.push(DROP_FOR_SIZE[i]);
        json = JSON.stringify(st);
      }
    }
    if (json.length > SNAP_MAX_CHARS && st.world && st.world.visited && typeof st.world.visited === "object") {
      st.world.visited_count = Object.keys(st.world.visited).length;
      delete st.world.visited;
      info.dropped.push("world.visited");
      json = JSON.stringify(st);
    }
    if (json.length > SNAP_MAX_CHARS) {
      var keep = ["phase", "fire", "temperature", "game_time_sec", "population", "builder_level", "stores", "buildings", "unlocked", "workers", "location", "ending_reached", "slice_complete"];
      var slim = {};
      keep.forEach(function (k) { if (st[k] !== undefined) slim[k] = st[k]; });
      st = slim;
      info.truncated = true;
      json = JSON.stringify(st);
    }
    info.chars = json.length;
    return { state: st, info: info };
  }

  function readSaveDoc() {
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem("adr.save.v1");
        if (raw) {
          var d = JSON.parse(raw);
          if (d && d.state && typeof d.state === "object") return d;
        }
      }
    } catch (e) { /* ignore */ }
    var g = game();
    if (g && g.state) return { v: 1, state: JSON.parse(JSON.stringify(g.state)) };
    return null;
  }

  function buildSnapshot(trigger, extra) {
    var doc = readSaveDoc();
    if (!doc) return null;
    var clean = sanitize(doc.state, 0);
    delete clean.session_id; /* anon id is sent once, at top level */
    var fit = fitSize(clean);
    var t = tel();
    var c = (typeof root.ADR_TELEMETRY === "object" && root.ADR_TELEMETRY) || {};
    return {
      trigger: trigger,
      milestone: (extra && extra.milestone) || null,
      snapshot_schema: SNAP_SCHEMA,
      save_version: doc.v || 1,
      game_version: (t && t.clientVersion && t.clientVersion()) || c.client_version || "unknown",
      anon_id: (t && t.sessionId && t.sessionId()) || (doc.save_id || null),
      captured_at: new Date().toISOString(),
      interval_min: snapCfg().minutes,
      size_chars: fit.info.chars,
      truncated: fit.info.truncated,
      dropped: fit.info.dropped,
      purpose: "player_behavior_analysis_only",
      save_data: fit.state
    };
  }

  function snapshot(trigger, extra) {
    if (optedOut()) return null;
    var t = tel();
    if (!t || !t.log) return null;
    var p = buildSnapshot(trigger || "manual", extra);
    if (!p) return null;
    snapState.lastAt = Date.now();
    snapState.count += 1;
    return t.log("save_snapshot", p);
  }

  function tick() {
    if (!snapState.lastAt) { snapState.lastAt = Date.now(); return null; }
    if (Date.now() - snapState.lastAt >= snapCfg().intervalMs) return snapshot("timer");
    return null;
  }

  var MILESTONE_ACTIONS = { light_fire: "fire_lit", embark: "explore_start" };
  /* Called by telemetry.js after every logged event. */
  function onEvent(name, payload) {
    if (name === "save_snapshot") return null;
    payload = payload || {};
    var g = game();
    var onExp = !!(g && g.state && g.state.world && g.state.world.on_expedition);
    var expEnded = snapState.onExp === true && !onExp;
    snapState.onExp = onExp;
    var trig = null;
    var extra = {};
    if (name === "player_action" && payload.ok !== false && MILESTONE_ACTIONS[payload.action]) trig = MILESTONE_ACTIONS[payload.action];
    else if (name === "build") trig = "building_built";
    else if (name === "stage_reached" || name === "unlock") trig = "stage_transition";
    else if (name === "death") trig = "death";
    else if (name === "ending_reached") trig = "ending";
    else if (name === "late_game_milestone") { trig = "milestone"; extra.milestone = payload.milestone || null; }
    else if (name === "prestige_start" || name === "new_game_start" || name === "slice_complete") trig = name;
    else if (name === "save_load" && payload.ok) trig = "save_load";
    else if (name === "save_write" && Date.now() - snapState.lastSaveTrigAt >= SAVE_THROTTLE_MS) {
      snapState.lastSaveTrigAt = Date.now();
      trig = "save";
    }
    if (expEnded && !trig) trig = "explore_end";
    if (trig) return snapshot(trig, extra);
    return tick();
  }

  function startTimer() {
    if (snapState.timer || typeof setInterval !== "function") return;
    snapState.lastAt = snapState.lastAt || Date.now();
    snapState.timer = setInterval(tick, 30000) || 1;
  }

  root.ADRSaveTelemetry = {
    hookGame: hookGame,
    hookKnownKeys: hookKnownKeys,
    watchKey: watchKey,
    onSaveWrite: onSaveWrite,
    onSaveLoad: onSaveLoad,
    onSaveCorrupt: onSaveCorrupt,
    onNewGame: onNewGame,
    previousSaveContext: previousSaveContext,
    validateBlob: validateBlob,
    checksum: checksum,
    backupCorrupt: backupCorrupt,
    snapshot: snapshot,
    buildSnapshot: buildSnapshot,
    sanitize: sanitize,
    onEvent: onEvent,
    tick: tick,
    optedOut: optedOut,
    startTimer: startTimer,
    SNAP_MAX_CHARS: SNAP_MAX_CHARS,
    _snap: snapState
  };

  if (typeof document !== "undefined") {
    setTimeout(function () {
      if (!hooked) hookGame(game());
      startTimer();
    }, 0);
  }
})(typeof self !== "undefined" ? self : this);
