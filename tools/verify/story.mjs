#!/usr/bin/env node
/**
 * Story progression check: drives the rule director through every phase
 * (room_dark > room_fire > stranger > forest > village > path > world > slice_complete)
 * headlessly against engine.js with a fake wall clock. Derived from the
 * adr-story-audit phase_run.mjs driver. Each run must reach slice_complete.
 *
 *   node tools/verify/story.mjs [--runs 5]
 */
import { fileURLToPath } from "node:url";
import { makeSandbox, loadEvents } from "./lib/engine-sandbox.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";

export const PHASES = ["room_fire", "stranger", "forest", "village", "path", "world", "slice_complete"];

export function playthrough({ maxGameSec = 9000, seed = 1 } = {}) {
  const sb = makeSandbox({ seed });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const S = () => g.state;
  const reached = {};
  let last = S().phase;
  const errors = {};
  const rec = (why) => {
    if (S().phase !== last) {
      last = S().phase;
      if (!reached[last]) reached[last] = { t: Math.round(S().game_time_sec), via: why };
    }
  };
  const A = (n, a = {}) => {
    const r = g.act(n, a);
    if (!r.ok && r.error !== "cooldown") errors[`${n}:${r.error}`] = (errors[`${n}:${r.error}`] || 0) + 1;
    rec(n);
    return r;
  };
  const afford = (c) => !c || Object.entries(c).every(([k, v]) => (S().stores[k] || 0) >= v);
  function resolve() {
    const e = S().active_event;
    if (!e) return;
    if (S().combat) { A("combat", { move: "punch" }); return; }
    const sp = events[e.id];
    const sc = e.scene && sp.scenes && sp.scenes[e.scene] ? sp.scenes[e.scene] : sp;
    const okb = (sc.buttons || []).filter((x) => afford(x.cost)).map((x) => x.id);
    const pick = ["take", "enter", "buy_compass", "goodbye", "leave", "back", "home", "ignore", "wait", "mourn"].find((x) => okb.includes(x)) || okb[0];
    if (pick) A("event_choice", { button: pick });
  }
  function tick(sec) {
    for (let i = 0; i < Math.ceil(sec / 0.25); i++) {
      sb.advance(250);
      g.tick(0.25);
      if (S().active_event && !S().world.on_expedition) resolve();
      rec("tick");
    }
  }
  const warm = () => { if (S().fire < 2 && (S().stores.wood || 0) > 0) { A("travel", { area: "room" }); A("stoke_fire"); } };

  A("light_fire");
  tick(50);
  for (let i = 0; i < 20000 && S().game_time_sec < maxGameSec * 0.66 && !S().unlocked.path; i++) {
    warm();
    if (S().unlocked.outside) { A("travel", { area: "outside" }); A("gather_wood"); }
    if (S().buildings.trap > 0) A("check_traps");
    if (S().builder_level === 3) A("travel", { area: "room" });
    const w = S().stores.wood || 0, b = S().buildings;
    if (S().builder_level >= 4) {
      if (b.trap < 1 && w >= 10) A("build", { kind: "trap" });
      else if (b.cart < 1 && w >= 30) A("build", { kind: "cart" });
      else if (b.hut < 1 && w >= 100) { A("travel", { area: "room" }); A("build", { kind: "hut" }); }
      else if (b.trap < 4 && b.hut >= 1 && w >= 10 + 10 * b.trap) A("build", { kind: "trap" });
    }
    tick(1);
  }
  while ((S().stores.meat || 0) < 6 && S().game_time_sec < maxGameSec) {
    warm();
    A("travel", { area: "outside" });
    A("check_traps");
    A("gather_wood");
    tick(2);
  }
  A("travel", { area: "path" });
  A("pack", { item: "meat", amount: S().stores.meat || 0 });
  A("embark");
  const mv = (dx, dy) => { A("world_move", { dx, dy }); let k = 0; while (S().active_event && k++ < 40) resolve(); };
  for (const [dx, dy] of [[1, 0], [1, 0], [1, 0], [0, -1], [0, -1], [0, 1], [0, 1], [-1, 0], [-1, 0], [-1, 0]]) {
    if (!S().world.on_expedition) break;
    mv(dx, dy);
  }
  tick(2);
  return {
    reached,
    final: S().phase,
    slice_complete: !!S().slice_complete,
    visited_old_house: !!S().flags.visited_old_house,
    hp: S().world.hp,
    game_time_sec: Math.round(S().game_time_sec),
    unexpected_errors: errors
  };
}

const TRIGGERS = {
  room_fire: "light_fire (fire > 0)",
  stranger: "fire > 1, builder arrives 30s later",
  forest: "15s after builder, outside unlocked + 4 wood",
  village: "builder_level 4, 100 wood, warm room -> build hut",
  path: "hut >= 1 and fur >= 1 -> builder_finds_compass -> take compass",
  world: "path unlocked + packed meat -> embark",
  slice_complete: "visit old_house (8,3) and return home alive"
};

export function runStory({ runs = 5 } = {}) {
  const suite = emptySuite("story");
  for (let r = 1; r <= runs; r++) {
    const res = playthrough({ seed: 1000 + r });
    for (const ph of PHASES) {
      const hit = res.reached[ph];
      const check = { id: `run${r}:${ph}`, trigger: TRIGGERS[ph], expected: "reached", actual: hit ? `reached @${hit.t}s via ${hit.via}` : `not reached (final ${res.final})` };
      if (hit) ok(suite, check); else fail(suite, { ...check, detail: JSON.stringify(res) });
    }
    const bad = Object.keys(res.unexpected_errors).filter((k) => !/^(build:cost|embark:no_food|combat:|world_move:event_open|pack:)/.test(k));
    if (bad.length) suite.warnings.push({ id: `run${r}:errors`, detail: res.unexpected_errors });
  }
  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--runs");
  const suite = runStory({ runs: i > 0 ? Number(process.argv[i + 1]) : 5 });
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, results: suite.results, warnings: suite.warnings }, null, 2));
  process.exit(summary.exitCode);
}
