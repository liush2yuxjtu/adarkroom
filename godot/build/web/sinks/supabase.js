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
  root.ADRSupabaseSink = { headersFromAnonKey: headersFromAnonKey, rowFromEvent: rowFromEvent };
})(typeof self !== "undefined" ? self : this);
