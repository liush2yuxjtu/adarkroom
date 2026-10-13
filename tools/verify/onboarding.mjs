#!/usr/bin/env node
/**
 * Early-game onboarding: persistent goal line appears on a new save and
 * updates through fire → stranger → forest. Headless engine, mocked sink.
 *
 *   node tools/verify/onboarding.mjs
 */
import { fileURLToPath } from "node:url";
import { makeSandbox, loadEvents, bufferOf, tickGame } from "./lib/engine-sandbox.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";

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

function goalEvents(sb, g, name) {
  return bufferOf(sb, g).filter((e) => e.event_name === name);
}

function hasVersion(payload) {
  return payload && typeof payload.client_version === "string" && payload.client_version.length > 0;
}

export function runOnboarding() {
  const suite = emptySuite("onboarding");

  check(suite, "new-save-shows-goal", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    const goal = g.state.goal;
    const shown = goalEvents(sb, g, "goal_prompt_shown");
    const stages = goalEvents(sb, g, "stage_reached");
    const notes = (g.state.notifications || []).map((n) => n.text).join(" ");
    const persist = goal && goal.id === "light_fire" && /生火/.test(goal.text);
    const oneLine = shown.filter((e) => e.payload.goal_id === "light_fire").length === 1;
    return {
      pass: persist && oneLine && stages.some((e) => e.payload.stage === "room_dark") && /生火/.test(notes),
      detail: `goal=${JSON.stringify(goal)} shown=${shown.length} notes=${notes.slice(0, 40)}`
    };
  });

  check(suite, "updates-through-early-stages", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    const seen = [];
    const record = (why) => {
      const id = g.state.goal && g.state.goal.id;
      if (id && seen[seen.length - 1] !== id) seen.push(id);
      return why;
    };
    record("boot");
    g.act("light_fire");
    record("light");
    if (g.state.goal.id !== "stoke_fire") {
      return { pass: false, detail: `after light expected stoke_fire, got ${g.state.goal && g.state.goal.id}` };
    }
    tickGame(sb, g, 50);
    record("wait-forest");
    if (!g.state.unlocked.outside) {
      return { pass: false, detail: `outside not unlocked after 50s (phase=${g.state.phase})` };
    }
    if (g.state.goal.id !== "go_forest" || g.state.goal.text !== "去森林看看") {
      return { pass: false, detail: `after unlock expected go_forest, got ${JSON.stringify(g.state.goal)}` };
    }
    g.act("travel", { area: "outside" });
    record("travel");
    if (g.state.goal.id !== "gather_wood") {
      return { pass: false, detail: `after travel expected gather_wood, got ${JSON.stringify(g.state.goal)}` };
    }
    g.act("gather_wood");
    record("gather");
    const shownIds = goalEvents(sb, g, "goal_prompt_shown").map((e) => e.payload.goal_id);
    const acted = goalEvents(sb, g, "goal_prompt_acted").map((e) => e.payload.goal_id);
    const stages = goalEvents(sb, g, "stage_reached").map((e) => e.payload.stage);
    const needShown = ["light_fire", "stoke_fire", "go_forest", "gather_wood"];
    const needActed = ["light_fire", "go_forest"];
    const needStages = ["room_dark", "room_fire", "forest"];
    const missingShown = needShown.filter((id) => !shownIds.includes(id));
    const missingActed = needActed.filter((id) => !acted.includes(id));
    const missingStages = needStages.filter((id) => !stages.includes(id));
    const singleActive = typeof g.state.goal.text === "string" && !/；|;/.test(g.state.goal.text);
    return {
      pass: missingShown.length === 0 && missingActed.length === 0 && missingStages.length === 0 && singleActive,
      detail: `seen=${seen.join(">")} shown=${shownIds.join(",")} acted=${acted.join(",")} stages=${stages.join(",")}`
    };
  });

  check(suite, "goal-telemetry-has-version", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    g.act("light_fire");
    const names = ["goal_prompt_shown", "goal_prompt_acted", "stage_reached"];
    const rows = bufferOf(sb, g).filter((e) => names.includes(e.event_name));
    const bad = rows.filter((e) => !hasVersion(e.payload));
    const ver = rows[0] && rows[0].payload && rows[0].payload.client_version;
    const override = (() => {
      const sb2 = makeSandbox();
      sb2.ctx.ADR_TELEMETRY = Object.assign({}, sb2.ctx.ADR_TELEMETRY || {}, { client_version: "test-build-tag" });
      const g2 = newGame(sb2);
      const shown = goalEvents(sb2, g2, "goal_prompt_shown")[0];
      return shown && shown.payload.client_version === "test-build-tag";
    })();
    return {
      pass: rows.length >= 3 && bad.length === 0 && !!ver && override,
      detail: `rows=${rows.length} missing_client_version=${bad.length} client_version=${ver} override=${override}`
    };
  });

  check(suite, "no-quest-hud-state", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    const goal = g.state.goal;
    const extras = Object.keys(g.state).filter((k) => /quest|task|hud|objective/i.test(k));
    return {
      pass: extras.length === 0 && goal && typeof goal.text === "string" && !Array.isArray(goal),
      detail: `goal keys=${Object.keys(goal || {}).join(",")} extras=${extras.join(",")}`
    };
  });

  check(suite, "build-trap-gate-after-builder", () => {
    const sb = makeSandbox();
    const g = newGame(sb);
    g.act("light_fire");
    tickGame(sb, g, 50);
    g.act("travel", { area: "outside" });
    g.state.builder_level = 4;
    g.state.stores.wood = 10;
    g.state.wood_initialized = true;
    g.syncGoal("tick");
    const goal = g.state.goal;
    const shown = goalEvents(sb, g, "goal_prompt_shown").map((e) => e.payload.goal_id);
    return {
      pass: goal && goal.id === "build_trap" && /陷阱/.test(goal.text) && shown.includes("build_trap"),
      detail: `goal=${JSON.stringify(goal)} shown=${shown.join(",")}`
    };
  });

  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = runOnboarding();
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, results: suite.results }, null, 2));
  process.exit(summary.exitCode);
}
