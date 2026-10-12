/* Optional Supabase REST sink. Used by the settings panel / Analytics HTTP path.
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
(function (root) {
  function headersFromAnonKey(anonKey) {
    return {
      apikey: anonKey,
      Authorization: "Bearer " + anonKey,
      Prefer: "return=minimal",
      "Content-Type": "application/json"
    };
  }
  function rowFromEvent(ev) {
    return {
      session_id: ev.session_id,
      event_name: ev.event_name,
      occurred_at: ev.occurred_at,
      game_time_sec: ev.game_time_sec,
      phase: ev.phase,
      payload: ev.payload || {},
      user_agent: ev.user_agent || ""
    };
  }
  function beaconUrl(url, anonKey) {
    if (!url || !anonKey) return "";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "apikey=" + encodeURIComponent(anonKey);
  }
  function postRows(url, anonKey, rows, opts) {
    opts = opts || {};
    if (!url || !anonKey || !rows || !rows.length) return false;
    var body = JSON.stringify(rows);
    if (opts.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(beaconUrl(url, anonKey), new Blob([body], { type: "application/json" }))) {
          return true;
        }
      } catch (e) { /* fall through to fetch */ }
    }
    if (typeof fetch !== "function") return false;
    fetch(url, {
      method: "POST",
      keepalive: true,
      headers: headersFromAnonKey(anonKey),
      body: body
    }).catch(function () { /* playtest sink must not break the game */ });
    return true;
  }
  root.ADRSupabaseSink = {
    headersFromAnonKey: headersFromAnonKey,
    rowFromEvent: rowFromEvent,
    beaconUrl: beaconUrl,
    postRows: postRows
  };
})(typeof self !== "undefined" ? self : this);
