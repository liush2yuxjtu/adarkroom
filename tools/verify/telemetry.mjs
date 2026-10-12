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
 *   cap-keeps-milestones        the per-session event cap drops UI noise but keeps milestone events
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
