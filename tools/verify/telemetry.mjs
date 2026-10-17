#!/usr/bin/env node
/**
 * Telemetry checks, run headlessly against engine.js (+ telemetry.js / sinks/supabase.js)
 * with a mocked sink. Never sends to production Supabase.
 *
 *   node tools/verify/telemetry.mjs            # JSON on stdout, exit 1 on FAIL
 *
 * Checks (ids):
 *   phase-resync-after-load     phase_time after a save load reports the restored phase, not room_dark/0
 *   failed-action-reported      rejected actions log player_action {ok:false, error}; successes carry ok:true
 *   stuck-detector-fires        an idle player gets a `stuck` event even with large ticks / passive income
 *   client-dedup                identical events in the same tick are logged once (engine + telemetry.js)
 *   resend-carries-event-id         every sent row carries a client event_id, so retried rows can be collapsed (no blind duplicates)
 *   session-start-first         every session's first engine event is session_start (synthetic if missing)
 *   automation-flagged          payload.is_automation is true under navigator.webdriver / headless UA, false otherwise
 *   client-version-on-every-event  every buffered and posted payload carries client_version (build-time git SHA)
 *   ui-shell-event              ui_shell carries scroll_max_* + scene_border_* + client_version (shell chrome fix)
 *   cap-keeps-milestones        the per-session event cap drops UI noise but keeps milestone events
 *   save-snapshot-milestones    save_snapshot fires on fire lit / build / stage / explore start+end / death / ending
 *   save-snapshot-timer         save_snapshot fires every N minutes (default 5, configurable), not before
 *   save-snapshot-sanitized     payload.save_data has no PII keys/emails/session id, under 16KB cap, purpose tag set
 *   save-snapshot-endpoint      mocked playtest_events endpoint receives save_snapshot rows (201) within RLS size
 *   save-snapshot-opt-out       adr.telemetry_optout=1 / ADR_TELEMETRY.save_snapshot=false suppress save_snapshot
 *   worker-assign-logged        assign_worker writes worker_assign {job, delta, workers, population}
 *   cured-meat-first-logged     first charcutier yield writes cured_meat_first {source, cured_meat}
 */
import { fileURLToPath } from "node:url";
import { makeSandbox, loadEvents, bufferOf, tickGame } from "./lib/engine-sandbox.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";

const HEADLESS_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/129.0 Safari/537.36";

function check(suite, id, fn) {
  try {
    const r = fn();
    if (r === true || (r && r.pass)) ok(suite, { id, ...(r && r.detail ? { detail: r.detail } : {}) });
    else fail(suite, { id, detail: (r && r.detail) || "check returned false" });
  } catch (e) {
    fail(suite, { id, detail: "threw: " + String(e && e.message || e) });
  }
}

function newGame(sb, cfg = {}) {
  return new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99, ...cfg }, loadEvents());
}

function toForest(sb, g) {
  g.act("light_fire");
  tickGame(sb, g, 50);
}

export function runTelemetry() {
  const suite = emptySuite("telemetry");

  check(suite, "phase-resync-after-load", () => {
    const sb1 = makeSandbox();
    const g1 = newGame(sb1);
    toForest(sb1, g1);
    g1.persistSave(true);
    const savedPhase = g1.state.phase;
    const savedT = g1.state.game_time_sec;
    const sb2 = makeSandbox({ storage: sb1.ctx.localStorage });
    const g2 = newGame(sb2);
    const start = bufferOf(sb2, g2).length;
    if (g2.state.phase !== savedPhase) return { pass: false, detail: `save did not restore (${g2.state.phase} vs ${savedPhase})` };
    tickGame(sb2, g2, 2);
    // Force a phase change to see what phase_time reports.
    g2.act("travel", { area: "room" });
    g2.state.buildings.hut = 1;
    tickGame(sb2, g2, 1);
    const pt = bufferOf(sb2, g2).slice(start).filter((e) => e.event_name === "phase_time");
    const bad = pt.filter((e) => e.payload.phase !== savedPhase || e.payload.seconds > 10);
    if (!pt.length) return { pass: false, detail: "no phase_time after forced phase change" };
    return { pass: bad.length === 0, detail: bad.length ? `phase_time after load: ${JSON.stringify(bad.map((e) => e.payload))} (saved ${savedPhase}@${Math.round(savedT)}s)` : `ok ${JSON.stringify(pt[0].payload)}` };
  });

  check(suite, "failed-action-reported", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    const r = g.act("build", { kind: "hut" });
    g.act("light_fire");
    const acts = bufferOf(sb, g).filter((e) => e.event_name === "player_action");
    const failed = acts.find((e) => e.payload.action === "build" && e.payload.ok === false && e.payload.error);
    const success = acts.find((e) => e.payload.action === "light_fire" && e.payload.ok === true);
    return { pass: !r.ok && !!failed && !!success, detail: `failed=${JSON.stringify(failed && failed.payload)} success_ok=${success && success.payload.ok}` };
  });

  check(suite, "stuck-detector-fires", () => {
    const sb = makeSandbox();
    const g = newGame(sb, { stuck_minutes: 3, time_scale: 20 });
    g.act("light_fire");
    tickGame(sb, g, 60); // 60 real sec * 20 = 1200 game sec of idling
    const stuck = bufferOf(sb, g).filter((e) => e.event_name === "stuck");
    return { pass: stuck.length >= 1, detail: `stuck events=${stuck.length} game_time=${Math.round(g.state.game_time_sec)}` };
  });

  check(suite, "client-dedup", () => {
    const res = [];
    for (const telemetry of [false, true]) {
      const sb = makeSandbox({ telemetry });
      const g = newGame(sb);
      g.analytics.log(g.state, "quit", { reason: "x" });
      g.analytics.log(g.state, "quit", { reason: "x" });
      const n = bufferOf(sb, g).filter((e) => e.event_name === "quit").length;
      res.push(`${telemetry ? "telemetry.js" : "engine"}=${n}`);
      if (n !== 1) return { pass: false, detail: res.join(" ") };
    }
    return { pass: true, detail: res.join(" ") };
  });

  check(suite, "resend-carries-event-id", () => {
    const sb = makeSandbox({ telemetry: true });
    const posted = [];
    let failNext = true;
    // Mock sink: first batch "fails" after delivery (the classic duplicate source), later ones succeed.
    sb.ctx.ADRSupabaseSink.postRows = (url, key, rows, opts) => {
      posted.push(...rows);
      if (failNext) { failNext = false; opts.onFail(new Error("timeout"), 1, "timeout"); }
      else opts.onOk({ ok: true, status: 201, via: "mock" }, 1);
      return Promise.resolve();
    };
    const g = newGame(sb);
    const T = sb.ctx.ADRTelemetry._state;
    for (let i = 0; i < 40; i++) sb.ctx.ADRTelemetry.log("resource_snapshot", { i });
    for (const why of ["interval", "retry", "hidden", "pagehide", "drain", "retry"]) { T.inflight = false; sb.ctx.ADRTelemetry.flush(why); }
    const ids = posted.map((r) => r.payload && r.payload.event_id);
    const missing = ids.filter((x) => !x).length;
    const dupIds = ids.length - new Set(ids.filter(Boolean)).size - missing;
    // A row may legitimately be re-sent after a reported failure, but it must carry the same
    // event_id so analysis and the server can collapse it.
    return { pass: missing === 0 && posted.length > 0, detail: `posted=${posted.length} missing_event_id=${missing} resent_same_id=${dupIds}` };
  });

  check(suite, "telemetry-requeue-skips-sent", () => {
    const sb = makeSandbox({ telemetry: true });
    const T = sb.ctx.ADRTelemetry._state;
    const g = newGame(sb);
    const ids = T.buffer.map((e) => e.payload && e.payload.event_id).filter(Boolean);
    const uniq = new Set(ids);
    return { pass: ids.length > 0 && uniq.size === ids.length && !!T.sentIds, detail: `event_ids=${ids.length} unique=${uniq.size} sentIds=${!!T.sentIds}` };
  });

  check(suite, "session-start-first", () => {
    const out = [];
    for (const telemetry of [false, true]) {
      const sb = makeSandbox({ telemetry });
      const g = newGame(sb);
      // simulate a session whose start was lost (e.g. rotated id without a start)
      g.state.session_id = "verify-orphan-session";
      if (sb.ctx.ADRTelemetry) sb.ctx.ADRTelemetry.setSessionId("verify-orphan-session");
      g.analytics.log(g.state, "resource_snapshot", { reason: "verify" });
      const evs = bufferOf(sb, g).filter((e) => e.session_id === "verify-orphan-session");
      out.push(`${telemetry ? "telemetry.js" : "engine"}:${evs.map((e) => e.event_name).join(">")}`);
      if (!evs.length || evs[0].event_name !== "session_start") return { pass: false, detail: out.join(" | ") };
      const first = bufferOf(sb, g).filter((e) => e.session_id !== "verify-orphan-session" && e.phase);
      if (first.length && first[0].event_name !== "session_start") return { pass: false, detail: `boot first event ${first[0].event_name}` };
    }
    return { pass: true, detail: out.join(" | ") };
  });

  check(suite, "automation-flagged", () => {
    const rows = [];
    for (const [label, opt, expect] of [
      ["webdriver", { webdriver: true }, true],
      ["headless-ua", { ua: HEADLESS_UA }, true],
      ["human", {}, false]
    ]) {
      for (const telemetry of [false, true]) {
        const sb = makeSandbox({ ...opt, telemetry });
        const g = newGame(sb);
        g.act("light_fire");
        const evs = bufferOf(sb, g).filter((e) => e.event_name === "session_start" || e.event_name === "player_action");
        const good = evs.length > 0 && evs.every((e) => e.payload && e.payload.is_automation === expect);
        rows.push(`${label}/${telemetry ? "tel" : "eng"}=${good}`);
        if (!good) return { pass: false, detail: rows.join(" ") + " sample=" + JSON.stringify(evs[0] && evs[0].payload) };
      }
    }
    return { pass: true, detail: rows.join(" ") };
  });

  check(suite, "client-version-on-every-event", () => {
    const rows = [];
    for (const telemetry of [false, true]) {
      const sb = makeSandbox({ telemetry });
      const g = newGame(sb);
      g.act("light_fire");
      const evs = bufferOf(sb, g);
      const missing = evs.filter((e) => !e.payload || !e.payload.client_version);
      if (missing.length) {
        return { pass: false, detail: `${telemetry ? "tel" : "eng"} missing client_version on ${missing.length}/${evs.length}` };
      }
      if (telemetry) {
        const bad = evs.filter((e) => e.payload.client_version !== "verify-sandbox");
        if (bad.length) {
          return { pass: false, detail: `tel stamp=${JSON.stringify(bad[0] && bad[0].payload && bad[0].payload.client_version)}` };
        }
      }
      rows.push(`${telemetry ? "tel" : "eng"}=${evs.length}:${evs[0].payload.client_version}`);
    }
    const sb = makeSandbox({ telemetry: true });
    const posted = [];
    sb.ctx.ADRSupabaseSink.postRows = (url, key, batch, opts) => {
      posted.push(...batch);
      if (opts && opts.onOk) opts.onOk({ ok: true, status: 201, via: "mock" }, 1);
      return Promise.resolve();
    };
    newGame(sb);
    sb.ctx.ADRTelemetry.log("resource_snapshot", { reason: "verify-version" });
    const T = sb.ctx.ADRTelemetry._state;
    T.inflight = false;
    sb.ctx.ADRTelemetry.flush("interval");
    const postedMissing = posted.filter((r) => !r.payload || !r.payload.client_version);
    if (!posted.length || postedMissing.length) {
      return { pass: false, detail: `posted=${posted.length} missing=${postedMissing.length} ${rows.join(" ")}` };
    }
    const postedBad = posted.filter((r) => r.payload.client_version !== "verify-sandbox");
    return {
      pass: postedBad.length === 0,
      detail: `${rows.join(" ")} posted=${posted.length}`
    };
  });

  check(suite, "ui-shell-event", () => {
    const sb = makeSandbox({ telemetry: true });
    newGame(sb);
    sb.ctx.ADRTelemetry.log("ui_shell", {
      style: "text",
      width: 1280,
      height: 800,
      layout: "desktop",
      scroll_max_x: 0,
      scroll_max_y: 0,
      html_overflow_x: "visible",
      html_overflow_y: "visible",
      body_overflow_x: "visible",
      body_overflow_y: "visible",
      scene_border_width: "0px",
      scene_border_style: "none",
      has_canvas: false
    });
    const evs = sb.ctx.ADRTelemetry._state.buffer.filter((e) => e.event_name === "ui_shell");
    if (!evs.length) return { pass: false, detail: "no ui_shell in buffer" };
    const p = evs[0].payload || {};
    const missing = ["style", "scroll_max_x", "scroll_max_y", "scene_border_width", "client_version"]
      .filter((k) => p[k] == null || p[k] === "");
    if (missing.length) return { pass: false, detail: "missing " + missing.join(",") };
    if (p.client_version !== "verify-sandbox") return { pass: false, detail: "client_version=" + p.client_version };
    return { pass: true, detail: `style=${p.style} scroll_max_y=${p.scroll_max_y} border=${p.scene_border_width}` };
  });

  check(suite, "cap-keeps-milestones", () => {
    const sb = makeSandbox({ telemetry: true });
    const T = sb.ctx.ADRTelemetry._state;
    const g = newGame(sb);
    T.sent = 100000;
    sb.ctx.ADRTelemetry.log("button_hover_enter", { id: "x" });
    sb.ctx.ADRTelemetry.log("phase_time", { phase: "forest", seconds: 1 });
    g.act("light_fire");
    const tail = T.buffer.slice(-5).map((e) => e.event_name);
    const keptPhase = tail.includes("phase_time");
    const keptAct = tail.includes("player_action");
    const droppedHover = !tail.includes("button_hover_enter");
    return { pass: keptPhase && keptAct && droppedHover, detail: `tail=${tail.join(",")}` };
  });

  // ---------- save_snapshot (behavior-analysis-only save telemetry) ----------
  const snapSb = (o = {}) => {
    const sb = makeSandbox({ telemetry: true, saveTelemetry: true, ...o });
    const g = newGame(sb);
    sb.ctx.__ADR_GAME = g;
    return { sb, g, snaps: () => sb.ctx.ADRTelemetry._state.buffer.filter((e) => e.event_name === "save_snapshot") };
  };
  const PII_RE = /"(nick(name)?|e?mail|display_?name|user_?name|player_?name|name|session_id|user_?agent|ip|token|anon_?key|apikey)"\s*:/i;

  check(suite, "save-snapshot-milestones", () => {
    const { sb, g, snaps } = snapSb();
    const A = sb.ctx.ADRTelemetry;
    const want = {};
    g.act("light_fire");
    want.fire_lit = snaps().some((e) => e.payload.trigger === "fire_lit");
    A.log("build", { building: "cart" });
    want.building_built = snaps().some((e) => e.payload.trigger === "building_built");
    A.log("stage_reached", { stage: "forest" });
    want.stage_transition = snaps().some((e) => e.payload.trigger === "stage_transition");
    g.state.world.on_expedition = true;
    A.log("player_action", { action: "embark", ok: true });
    want.explore_start = snaps().some((e) => e.payload.trigger === "explore_start");
    g.state.world.on_expedition = false;
    A.log("player_action", { action: "world_move", ok: true });
    want.explore_end = snaps().some((e) => e.payload.trigger === "explore_end");
    A.log("death", { cause: "verify" });
    want.death = snaps().some((e) => e.payload.trigger === "death");
    A.log("ending_reached", { ending: "verify" });
    want.ending = snaps().some((e) => e.payload.trigger === "ending");
    A.log("save_write", { save_id: "x" });
    want.save = snaps().some((e) => e.payload.trigger === "save");
    const missing = Object.keys(want).filter((k) => !want[k]);
    return { pass: missing.length === 0, detail: `snaps=${snaps().length} missing=${missing.join(",") || "none"}` };
  });

  check(suite, "save-snapshot-timer", () => {
    const { sb, snaps } = snapSb();
    const S = sb.ctx.ADRSaveTelemetry;
    S.tick(); // arm
    sb.advance(4 * 60 * 1000);
    S.tick();
    const early = snaps().filter((e) => e.payload.trigger === "timer").length;
    sb.advance(61 * 1000);
    S.tick();
    const fired = snaps().filter((e) => e.payload.trigger === "timer").length;
    const { sb: sb2, snaps: snaps2 } = snapSb({ telemetryCfg: { save_snapshot_minutes: 1 } });
    sb2.ctx.ADRSaveTelemetry.tick();
    sb2.advance(61 * 1000);
    sb2.ctx.ADRSaveTelemetry.tick();
    const cfgFired = snaps2().filter((e) => e.payload.trigger === "timer").length;
    const interval = fired ? snaps().find((e) => e.payload.trigger === "timer").payload.interval_min : null;
    return { pass: early === 0 && fired === 1 && cfgFired === 1 && interval === 5, detail: `early=${early} fired=${fired} interval=${interval} cfg1min=${cfgFired}` };
  });

  check(suite, "save-snapshot-sanitized", () => {
    const { sb, g, snaps } = snapSb();
    g.act("light_fire");
    g.persistSave(true);
    const raw = JSON.parse(sb.ctx.localStorage.getItem("adr.save.v1"));
    raw.state.player_name = "Alice";
    raw.state.nickname = "al";
    raw.state.email = "alice@example.com";
    raw.state.flags = Object.assign({}, raw.state.flags, { display_name: "A", note: "mail me bob@example.com" });
    raw.state.notifications = Array.from({ length: 400 }, (_, i) => ({ text: "x".repeat(150) + i }));
    sb.ctx.localStorage.setItem("adr.save.v1", JSON.stringify(raw));
    sb.ctx.ADRSaveTelemetry.snapshot("verify");
    const ev = snaps().slice(-1)[0];
    if (!ev) return { pass: false, detail: "no snapshot" };
    const p = ev.payload;
    const json = JSON.stringify(p.save_data);
    const leaks = [];
    if (PII_RE.test(json)) leaks.push("pii_key");
    if (/@example\.com|Alice/.test(json)) leaks.push("pii_value");
    const size = JSON.stringify(p).length;
    const meta = p.snapshot_schema === 1 && p.anon_id === sb.ctx.ADRTelemetry.sessionId() && p.game_version && p.captured_at && p.purpose === "player_behavior_analysis_only";
    const hasState = p.save_data && p.save_data.stores && p.save_data.phase;
    return { pass: !leaks.length && size < 16384 && meta && hasState && p.dropped.includes("notifications"), detail: `size=${size} leaks=${leaks.join(",") || "none"} dropped=${p.dropped.join(",")} meta=${!!meta}` };
  });

  check(suite, "save-snapshot-endpoint", () => {
    const { sb, g } = snapSb();
    const posted = [];
    const statuses = [];
    sb.ctx.ADRSupabaseSink.postRows = (url, key, batch, opts) => {
      posted.push(...batch);
      statuses.push(201);
      if (opts && opts.onOk) opts.onOk({ ok: true, status: 201, via: "mock" }, batch.length);
      return Promise.resolve();
    };
    g.act("light_fire");
    sb.ctx.ADRTelemetry._state.inflight = false;
    sb.ctx.ADRTelemetry.flush("interval");
    const rows = posted.filter((r) => r.event_name === "save_snapshot");
    const sizes = rows.map((r) => Buffer.byteLength(JSON.stringify(r.payload)));
    const okRow = rows.length > 0 && rows.every((r) => r.payload && r.payload.save_data && r.session_id) && sizes.every((n) => n < 16384);
    return { pass: okRow && statuses.every((s) => s === 201), detail: `rows=${rows.length} max_bytes=${Math.max(0, ...sizes)} statuses=${statuses.join(",")}` };
  });

  check(suite, "save-snapshot-opt-out", () => {
    const a = snapSb();
    a.sb.ctx.localStorage.setItem("adr.telemetry_optout", "1");
    const before = a.snaps().length;
    a.g.act("light_fire");
    a.sb.ctx.ADRSaveTelemetry.snapshot("verify");
    const b = snapSb({ telemetryCfg: { save_snapshot: false } });
    b.g.act("light_fire");
    return { pass: a.snaps().length === before && b.snaps().length === 0, detail: `ls_optout=${a.snaps().length - before} cfg_optout=${b.snaps().length}` };
  });

  check(suite, "worker-assign-logged", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    g.state.builder_level = 4;
    g.state.population = 4;
    g.state.buildings.lodge = 1;
    g.state.buildings.hut = 1;
    sb.ADR.syncGatherers(g.state);
    const r = g.act("assign_worker", { job: "hunter", delta: 2 });
    const ev = bufferOf(sb, g).filter((e) => e.event_name === "worker_assign");
    const p = ev[0] && ev[0].payload;
    return {
      pass: r.ok && ev.length === 1 && p.job === "hunter" && p.delta === 2 && p.workers && p.workers.hunter === 2 && p.population === 4,
      detail: `ok=${r.ok} n=${ev.length} payload=${JSON.stringify(p && { job: p.job, delta: p.delta, hunter: p.workers && p.workers.hunter, pop: p.population })}`
    };
  });

  check(suite, "cured-meat-first-logged", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    g.state.builder_level = 4;
    g.state.population = 2;
    g.state.buildings.smokehouse = 1;
    g.state.buildings.hut = 1;
    g.state.stores.meat = 20;
    g.state.stores.wood = 20;
    g.state.stores.cured_meat = 0;
    g.state.workers.charcutier = 1;
    sb.ADR.syncGatherers(g.state);
    tickGame(sb, g, 10);
    const ev = bufferOf(sb, g).filter((e) => e.event_name === "cured_meat_first");
    const p = ev[0] && ev[0].payload;
    return {
      pass: ev.length === 1 && p.source === "charcutier" && p.cured_meat >= 1 && g.state.stores.cured_meat >= 1,
      detail: `n=${ev.length} cured=${g.state.stores.cured_meat} payload=${JSON.stringify(p && { source: p.source, cured_meat: p.cured_meat })}`
    };
  });

  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = runTelemetry();
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, results: suite.results }, null, 2));
  process.exit(summary.exitCode);
}
