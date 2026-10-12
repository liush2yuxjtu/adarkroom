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
  const village = { lodge: false, smokehouse: false, charcutier: false, cured_meat: 0, packed: 0 };
  function villageActs() {
    warm();
    if (S().unlocked.outside) { A("travel", { area: "outside" }); A("gather_wood"); }
    if (S().buildings.trap > 0) A("check_traps");
    if (S().builder_level === 3) A("travel", { area: "room" });
    const w = S().stores.wood || 0, b = S().buildings, st = S().stores;
    if (S().builder_level >= 4) {
      if (b.trap < 1 && w >= 10) A("build", { kind: "trap" });
      else if (b.cart < 1 && w >= 30) A("build", { kind: "cart" });
      else if (b.hut < 2 && w >= 100 + 50 * (b.hut || 0)) { A("travel", { area: "room" }); A("build", { kind: "hut" }); }
      else if (b.trap < 6 && w >= 10 + 10 * b.trap) A("build", { kind: "trap" });
      else if ((b.lodge || 0) < 1 && w >= 200 && (st.fur || 0) >= 10 && (st.meat || 0) >= 5) {
        A("travel", { area: "room" }); A("build", { kind: "lodge" });
      } else if ((b.smokehouse || 0) < 1 && w >= 600 && (st.meat || 0) >= 50) {
        A("travel", { area: "room" }); A("build", { kind: "smokehouse" });
      }
    }
    if ((S().buildings.smokehouse || 0) >= 1 && (S().workers.charcutier || 0) < 1) {
      if ((S().workers.gatherer || 0) < 1 && (S().workers.hunter || 0) > 0) {
        A("assign_worker", { job: "hunter", delta: -1 });
      }
      if ((S().workers.gatherer || 0) > 0) A("assign_worker", { job: "charcutier", delta: 1 });
    } else if ((S().buildings.lodge || 0) >= 1 && (S().workers.hunter || 0) < Math.max(1, (S().population || 0) - 1) && (S().workers.gatherer || 0) > 1) {
      A("assign_worker", { job: "hunter", delta: 1 });
    }
    if ((S().buildings.lodge || 0) >= 1) village.lodge = true;
    if ((S().buildings.smokehouse || 0) >= 1) village.smokehouse = true;
    if ((S().workers.charcutier || 0) >= 1) village.charcutier = true;
    village.cured_meat = S().stores.cured_meat || 0;
  }
  for (let i = 0; i < 20000 && S().game_time_sec < maxGameSec * 0.55 && (S().buildings.hut || 0) < 1; i++) {
    villageActs();
    tick(1);
  }
  for (let i = 0; i < 30000 && S().game_time_sec < maxGameSec * 0.88 && village.cured_meat <= 0; i++) {
    villageActs();
    tick(1);
  }
  while ((S().stores.meat || 0) + (S().stores.cured_meat || 0) < 2 && S().game_time_sec < maxGameSec) {
    villageActs();
    tick(2);
  }
  A("travel", { area: "path" });
  if ((S().stores.cured_meat || 0) > 0) {
    A("pack", { item: "cured_meat", amount: S().stores.cured_meat || 0 });
  }
  if ((S().stores.meat || 0) > 0) A("pack", { item: "meat", amount: S().stores.meat || 0 });
  village.packed = S().outfit.cured_meat || 0;
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
    unexpected_errors: errors,
    village
  };
}

/** Headless batch-2 workshop crafts: costs, caps, notifications, water/bag/armour. */
export function workshopPlaythrough() {
  const sb = makeSandbox({ seed: 2 });
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, {});
  const s = g.state;
  s.builder_level = 4;
  s.temperature = 4;
  s.fire = 4;
  s.wood_initialized = true;
  s.unlocked.outside = true;
  s.location = "room";
  Object.assign(s.stores, {
    wood: 8000, cloth: 40, leather: 2500, iron: 800, steel: 400,
    teeth: 40, scales: 40, sulphur: 80
  });
  const noShop = g.act("build", { kind: "torch" });
  s.buildings.workshop = 1;
  const kinds = [
    "torch", "waterskin", "cask", "water_tank", "bone_spear", "rucksack", "wagon", "convoy",
    "l_armour", "i_armour", "s_armour", "iron_sword", "steel_sword", "rifle"
  ];
  const crafted = {};
  kinds.forEach((kind) => {
    const r = g.act("build", { kind });
    crafted[kind] = !!(r && r.ok && (s.stores[kind] || 0) > 0);
  });
  const waterskinAgain = g.act("build", { kind: "waterskin" });
  const notes = (s.notifications || []).map((n) => n.text || "");
  const hasTorchNote = notes.some((t) => /驱散黑暗的火把/.test(t));
  const hasRifleNote = notes.some((t) => /黑火药和子弹/.test(t));
  return {
    noWorkshopBlocked: !!(noShop && noShop.ok === false),
    crafted,
    allCrafted: kinds.every((k) => crafted[k]),
    waterskinCapped: !!(waterskinAgain && waterskinAgain.ok === false),
    water: sb.ADR.getMaxWater(s),
    bag: sb.ADR.bagCapacity(s),
    hp: sb.ADR.getMaxHealth(s),
    hasTorchNote,
    hasRifleNote
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
    const v = res.village || {};
    const extra = [
      { id: `run${r}:lodge`, ok: !!v.lodge, trigger: "200 wood + 10 fur + 5 meat, warm room", expected: "lodge built" },
      { id: `run${r}:smokehouse`, ok: !!v.smokehouse, trigger: "600 wood + 50 meat after lodge", expected: "smokehouse built" },
      { id: `run${r}:charcutier`, ok: !!v.charcutier, trigger: "assign_worker charcutier +1", expected: "charcutier >= 1" },
      { id: `run${r}:cured_meat`, ok: (v.cured_meat || 0) > 0, trigger: "charcutier income 1/10s", expected: "stores.cured_meat > 0" },
      { id: `run${r}:cured_meat_pack`, ok: (v.packed || 0) > 0, trigger: "pack cured_meat then embark", expected: "outfit.cured_meat > 0" }
    ];
    for (const c of extra) {
      const check = { id: c.id, trigger: c.trigger, expected: c.expected, actual: c.ok ? "reached" : JSON.stringify(v) };
      if (c.ok) ok(suite, check); else fail(suite, { ...check, detail: JSON.stringify(res) });
    }
    const bad = Object.keys(res.unexpected_errors).filter((k) => !/^(build:cost|embark:no_food|combat:|world_move:event_open|pack:|assign_worker:)/.test(k));
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
