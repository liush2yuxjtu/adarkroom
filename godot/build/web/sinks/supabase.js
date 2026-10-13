/* Optional Supabase REST sink. Used by the settings panel / Analytics HTTP path.
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function (root) {
  var MAX_KEEPALIVE = 60000;
  var DEFAULT_RETRIES = 3;

  function headersFromAnonKey(anonKey) {
    return {
      apikey: anonKey,
      Authorization: "Bearer " + anonKey,
      Prefer: "return=minimal",
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }
  function clientVersion() {
    try {
      var cfg = (typeof root.ADR_TELEMETRY === "object" && root.ADR_TELEMETRY) ||
        (typeof globalThis !== "undefined" && globalThis.ADR_TELEMETRY) || {};
      if (cfg && cfg.client_version) return String(cfg.client_version);
    } catch (e) { /* ignore */ }
    return "unknown";
  }

  function rowFromEvent(ev) {
    var payload = ev && ev.payload && typeof ev.payload === "object" ? ev.payload : {};
    if (!payload.client_version) payload.client_version = clientVersion();
    if (ev && ev.payload !== payload) ev.payload = payload;
    return {
      session_id: ev.session_id,
      event_name: ev.event_name,
      occurred_at: ev.occurred_at,
      game_time_sec: ev.game_time_sec,
      phase: ev.phase,
      payload: payload,
      user_agent: ev.user_agent || ""
    };
  }
  function beaconUrl(url, anonKey) {
    if (!url || !anonKey) return "";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "apikey=" + encodeURIComponent(anonKey);
  }
  function isAbortError(err) {
    if (!err) return false;
    var name = err.name || "";
    var msg = String(err.message || err);
    return name === "AbortError" || /abort|The user aborted/i.test(msg);
  }
  function failStatus(err) {
    if (!err) return "network";
    if (err.status) return err.status;
    if (isAbortError(err)) return "aborted";
    var msg = String(err.message || err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "network";
    return msg.slice(0, 40);
  }
  function tryBeacon(url, anonKey, body) {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return false;
    if (body.length > MAX_KEEPALIVE) return false;
    try {
      return !!navigator.sendBeacon(beaconUrl(url, anonKey), new Blob([body], { type: "application/json" }));
    } catch (e) {
      return false;
    }
  }
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function fetchRows(url, anonKey, body, opts) {
    var unloading = !!(opts && opts.beacon);
    var headers = headersFromAnonKey(anonKey);
    var fetchOpts = {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: headers,
      body: body
    };
    /* keepalive:true is recorded as net::ERR_ABORTED in Chromium/Playwright even when the POST returns 201. */
    return fetch(url, fetchOpts).then(function (r) {
      if (!r.ok) {
        var err = new Error(String(r.status));
        err.status = r.status;
        throw err;
      }
      return { ok: true, status: r.status, via: "fetch" };
    });
  }
  function postOnce(url, anonKey, rows, opts) {
    opts = opts || {};
    if (!url || !anonKey || !rows || !rows.length) {
      return Promise.resolve({ ok: false, status: "empty" });
    }
    var body = JSON.stringify(rows);
    if (opts.beacon) {
      if (tryBeacon(url, anonKey, body)) {
        return Promise.resolve({ ok: true, status: 0, via: "beacon" });
      }
      return Promise.resolve({ ok: false, status: "beacon-failed" });
    }
    if (typeof fetch !== "function") {
      return Promise.resolve({ ok: false, status: "no-fetch" });
    }
    return fetchRows(url, anonKey, body, opts);
  }
  function postRows(url, anonKey, rows, opts) {
    opts = opts || {};
    if (!url || !anonKey || !rows || !rows.length) return false;
    var retries = opts.retries == null ? DEFAULT_RETRIES : opts.retries;
    var attempt = 0;

    function run() {
      attempt += 1;
      return postOnce(url, anonKey, rows, opts).then(function (res) {
        if (opts.onOk) opts.onOk(res, attempt);
        return res;
      }).catch(function (err) {
        var aborted = isAbortError(err);
        /* Try the beacon before reporting failure: reporting first re-queued rows that the
         * beacon then also delivered, which produced duplicate rows ~0.1s apart. */
        if (aborted && opts.beacon) {
          var body = JSON.stringify(rows);
          if (tryBeacon(url, anonKey, body)) {
            var ok = { ok: true, status: 0, via: "beacon-retry" };
            if (opts.onOk) opts.onOk(ok, attempt);
            return ok;
          }
        }
        if (opts.onFail) opts.onFail(err, attempt, failStatus(err));
        if (attempt >= retries || (opts.beacon && aborted)) {
          return { ok: false, status: failStatus(err), attempt: attempt, error: err };
        }
        var wait = Math.min(8000, 400 * Math.pow(2, attempt - 1));
        return delay(wait).then(run);
      });
    }

    var p = run();
    if (opts.returnPromise) return p;
    p.catch(function () { /* playtest sink must not break the game */ });
    return true;
  }
  root.ADRSupabaseSink = {
    headersFromAnonKey: headersFromAnonKey,
    rowFromEvent: rowFromEvent,
    beaconUrl: beaconUrl,
    postRows: postRows,
    postOnce: postOnce,
    isAbortError: isAbortError,
    failStatus: failStatus,
    MAX_KEEPALIVE: MAX_KEEPALIVE
  };
})(typeof self !== "undefined" ? self : this);
