#!/usr/bin/env node
/**
 * Deterministic full playthrough of the remake engine (godot/build/web/engine.js).
 * Fresh save → village economy → forest → world/combat → mines → dungeon →
 * ship/fabricator → space/ending → prestige.
 *
 * Time acceleration is allowed. Reports game-time and wall-clock per stage.
 *
 *   node tools/verify/playthrough.mjs
 *   node tools/verify/playthrough.mjs --max-game-sec 200000
 */
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { makeSandbox, loadEvents } from "./lib/engine-sandbox.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";
import { STAGES, landmarkKey, parseXY, stepToward, pathHome } from "./lib/playthrough-policy.mjs";

const EVENT_PREFER = [
  "take", "enter", "scavenge", "search", "clear", "buy_compass",
  "goodbye", "leave", "back", "home", "ignore", "wait", "mourn"
];

export function playFull({ seed = 7, maxGameSec = 120000, timeScale = 50 } = {}) {
  const wall0 = performance.now();
  const sb = makeSandbox({ seed });
  const events = loadEvents();
  const g = new sb.ADR.Game({
    director: "rule",
    time_scale: 1,
    max_time_scale: 100,
    stuck_minutes: 99
  }, events);
  const S = () => g.state;
  const stages = {};
  const stuck = { room: S().location, event: null, action: null, missing: [] };
  const errors = {};
  let lastPhase = S().phase;

  const mark = (id, why) => {
    if (!stages[id]) {
      stages[id] = {
        t: Math.round(S().game_time_sec * 10) / 10,
        wall_ms: Math.round(performance.now() - wall0),
        via: why,
        location: S().location,
        phase: S().phase
      };
    }
  };

  const A = (n, a = {}) => {
    const r = g.act(n, a);
    if (!r || r.ok === false) {
      const key = `${n}:${(r && r.error) || "fail"}`;
      errors[key] = (errors[key] || 0) + 1;
    }
    if (S().phase !== lastPhase) {
      lastPhase = S().phase;
      mark(lastPhase, n);
    }
    if (S().fire > 0) mark("room_fire", n);
    if (S().builder_level >= 1) mark("stranger", n);
    if (S().unlocked.outside) mark("forest", n);
    if (S().buildings.hut > 0) mark("village", n);
    if (S().buildings.lodge > 0 && S().buildings.tannery > 0 && S().buildings.smokehouse > 0) {
      mark("village_econ", n);
    }
    if (S().unlocked.path) mark("path", n);
    if (S().world.on_expedition) mark("world", n);
    if (S().flags.cleared_iron_mine && S().flags.cleared_coal_mine && S().flags.cleared_sulphur_mine) {
      mark("mines", n);
    }
    if (S().flags.cleared_dungeon || S().flags.entered_dungeon) mark("dungeon", n);
    if (S().unlocked.ship) mark("ship", n);
    if (S().unlocked.fabricator) mark("fabricator", n);
    if (S().location === "space") mark("space", n);
    if (S().ending_reached) mark("ending", n);
    if (S().flags.prestige_done || (S().prestige && S().prestige.runs > 0)) mark("prestige", n);
    stuck.room = S().location;
    stuck.event = S().active_event ? S().active_event.id : null;
    stuck.action = n;
    return r;
  };

  const afford = (c) => !c || Object.entries(c).every(([k, v]) => (S().stores[k] || 0) >= v);

  function resolveEvent() {
    const e = S().active_event;
    if (!e) return;
    if (S().combat) {
      fight();
      return;
    }
    const sp = events[e.id];
    const sc = e.scene && sp && sp.scenes && sp.scenes[e.scene] ? sp.scenes[e.scene] : sp;
    const okb = ((sc && sc.buttons) || []).filter((x) => afford(x.cost)).map((x) => x.id);
    const pick = EVENT_PREFER.find((x) => okb.includes(x)) || okb[0];
    if (pick) A("event_choice", { button: pick });
  }

  function tick(sec) {
    const step = 0.25;
    const n = Math.ceil(sec / step);
    for (let i = 0; i < n; i++) {
      sb.advance(step * 1000);
      g.tick(step);
      if (S().active_event && !S().world.on_expedition) resolveEvent();
      if (S().combat) A("combat", { move: "attack" });
    }
  }

  const warm = () => {
    if (S().fire < 2 && (S().stores.wood || 0) > 0) {
      A("travel", { area: "room" });
      A("stoke_fire");
    }
  };

  function fight() {
    const food = (S().outfit.cured_meat || 0) + (S().outfit.meat || 0);
    if (S().world.hp <= 4 && food > 0) A("combat", { move: "eat" });
    else A("combat", { move: "attack" });
  }

  const store = (k) => S().stores[k] || 0;
  const bld = (k) => S().buildings[k] || 0;

  function tryBuild(kind) {
    if (bld(kind) > 0 && kind !== "hut" && kind !== "trap") return false;
    A("travel", { area: "room" });
    warm();
    const r = A("build", { kind });
    return !!(r && r.ok !== false);
  }

  function assign(job, want) {
    const have = S().workers[job] || 0;
    const d = want - have;
    if (d === 0) return;
    A("travel", { area: "outside" });
    const step = d > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(d); i++) A("assign_worker", { job, delta: step });
  }

  function gatherLoop(until, pred) {
    let i = 0;
    while (!pred() && S().game_time_sec < until && i++ < 80000) {
      warm();
      if (S().unlocked.outside) {
        A("travel", { area: "outside" });
        A("gather_wood");
        if (bld("trap") > 0) A("check_traps");
      }
      if (S().builder_level >= 4) {
        if (bld("trap") < 1 && store("wood") >= 10) tryBuild("trap");
        else if (bld("cart") < 1 && store("wood") >= 30) tryBuild("cart");
        else if (bld("hut") < 1 && store("wood") >= 100) tryBuild("hut");
        else if (bld("hut") < 8 && store("wood") >= 100 + 50 * bld("hut")) tryBuild("hut");
        else if (bld("trap") < 4 && store("wood") >= 10 + 10 * bld("trap")) tryBuild("trap");
        else if (bld("lodge") < 1 && store("wood") >= 200 && store("fur") >= 10 && store("meat") >= 5) tryBuild("lodge");
        else if (bld("tannery") < 1 && store("wood") >= 500 && store("fur") >= 50) tryBuild("tannery");
        else if (bld("smokehouse") < 1 && store("wood") >= 600 && store("meat") >= 50) tryBuild("smokehouse");
        else if (bld("workshop") < 1 && store("wood") >= 800 && store("leather") >= 100 && store("scales") >= 10) tryBuild("workshop");
        else if (bld("steelworks") < 1 && store("wood") >= 1500 && store("iron") >= 100 && store("coal") >= 100) tryBuild("steelworks");
        else if (bld("armoury") < 1 && store("wood") >= 3000 && store("steel") >= 100 && store("sulphur") >= 50) tryBuild("armoury");
        if (bld("workshop") > 0 && store("waterskin") < 1 && store("leather") >= 50) {
          A("travel", { area: "room" });
          A("build", { kind: "waterskin" });
        }
        if (bld("workshop") > 0 && store("bone_spear") < 1 && store("wood") >= 100 && store("teeth") >= 5) {
          A("travel", { area: "room" });
          A("build", { kind: "bone_spear" });
        }
        if (bld("workshop") > 0 && store("rucksack") < 1 && store("leather") >= 200) {
          A("travel", { area: "room" });
          A("build", { kind: "rucksack" });
        }
        if (bld("workshop") > 0 && store("cask") < 1 && store("leather") >= 100 && store("iron") >= 20) {
          A("travel", { area: "room" });
          A("build", { kind: "cask" });
        }
        if (bld("workshop") > 0 && store("l_armour") < 1 && store("cask") > 0 && store("leather") >= 200 && store("scales") >= 20) {
          A("travel", { area: "room" });
          A("build", { kind: "l_armour" });
        }
        if (bld("workshop") > 0 && store("water_tank") < 1 && store("iron") >= 100 && store("steel") >= 50) {
          A("travel", { area: "room" });
          A("build", { kind: "water_tank" });
        }
        if (bld("workshop") > 0 && store("wagon") < 1 && store("wood") >= 500 && store("iron") >= 100) {
          A("travel", { area: "room" });
          A("build", { kind: "wagon" });
        }
      }
      if (bld("lodge") > 0) {
        const pop = S().population || 0;
        // Hunters yield 0.5 fur/meat per 10s; tanner/charcutier each consume 5.
        // Assigning more processors than fur/meat income stalls the whole job
        // (applyWorkerIncome is all-or-nothing, same as classic $SM.collectIncome).
        const hunters = Math.min(Math.max(8, Math.floor(pop * 0.55)), Math.max(0, pop - 2));
        assign("hunter", hunters);
        const furPerTick = hunters * 0.5;
        const processors = Math.max(1, Math.min(2, Math.floor(furPerTick / 5)));
        if (bld("tannery") > 0) assign("tanner", processors);
        if (bld("smokehouse") > 0) assign("charcutier", processors);
        // Miners eat cured_meat; only run them while we still need iron for cask/wagon,
        // or after the far expeditions are done.
        const needIron = store("iron") < 100 || (store("cask") < 1 && store("iron") < 20);
        if (S().flags.cleared_iron_mine && (needIron || S().unlocked.ship)) assign("iron_miner", 1);
        else assign("iron_miner", 0);
        if (S().flags.cleared_coal_mine && S().unlocked.ship) assign("coal_miner", 1);
        else assign("coal_miner", 0);
        if (S().flags.cleared_sulphur_mine && S().unlocked.ship) assign("sulphur_miner", 1);
        else assign("sulphur_miner", 0);
        if (bld("steelworks") > 0) assign("steelworker", 2);
        if (bld("armoury") > 0) assign("armourer", 1);
      }
      tick(2);
    }
  }

  function packFood(min) {
    A("travel", { area: "path" });
    ["bone_spear", "iron_sword", "steel_sword", "energy_blade"].forEach((it) => {
      if (store(it) > 0 && !(S().outfit[it] > 0)) A("pack", { item: it, amount: 1 });
    });
    const used = Object.values(S().outfit).reduce((n, v) => n + (v || 0), 0);
    const cap = (store("cargo_drone") > 0 ? 110 : store("convoy") > 0 ? 70 : store("wagon") > 0 ? 40 : store("rucksack") > 0 ? 20 : 10);
    const room = Math.max(0, cap - used);
    const need = Math.min(min, room);
    const cured = store("cured_meat");
    if (cured > 0 && need > 0) A("pack", { item: "cured_meat", amount: Math.min(cured, need) });
    const still = need - ((S().outfit.cured_meat || 0));
    if (still > 0 && store("meat") > 0) A("pack", { item: "meat", amount: Math.min(store("meat"), still) });
  }

  function walkTo(id, until) {
    const key = landmarkKey(S().world.landmarks, id);
    const dest = parseXY(key);
    if (!dest) {
      stuck.missing.push("landmark:" + id);
      return false;
    }
    let guard = 0;
    while (S().world.on_expedition && guard++ < 400 && S().game_time_sec < until) {
      let k0 = 0;
      while ((S().active_event || S().combat) && k0++ < 80) {
        if (S().combat) fight();
        else resolveEvent();
      }
      if (S().world.x === dest.x && S().world.y === dest.y) {
        let k = 0;
        while ((S().active_event || S().combat) && k++ < 80) {
          if (S().combat) fight();
          else resolveEvent();
        }
        if (S().combat) mark("combat", "combat");
        return true;
      }
      const step = stepToward({ x: S().world.x, y: S().world.y }, dest);
      if (!step) break;
      A("world_move", step);
      let k = 0;
      while ((S().active_event || S().combat) && k++ < 80) {
        if (S().combat) {
          mark("combat", "combat");
          fight();
        } else resolveEvent();
      }
    }
    return S().world.x === dest.x && S().world.y === dest.y;
  }

  function goHome(until) {
    const home = pathHome(S().world);
    let guard = 0;
    while (S().world.on_expedition && guard++ < 400 && S().game_time_sec < until) {
      if (S().world.x === home.x && S().world.y === home.y) break;
      const step = stepToward({ x: S().world.x, y: S().world.y }, home);
      if (!step) break;
      A("world_move", step);
      let k = 0;
      while ((S().active_event || S().combat) && k++ < 40) {
        if (S().combat) A("combat", { move: "attack" });
        else resolveEvent();
      }
    }
  }

  function expedition(targets, until) {
    packFood(40);
    const emb = A("embark");
    if (!emb || emb.ok === false) {
      stuck.missing.push("embark:" + (emb && emb.error));
      return false;
    }
    for (const id of targets) walkTo(id, until);
    goHome(until);
    return true;
  }

  function tryUntil(flagPred, targets, tries) {
    let n = 0;
    while (!flagPred() && n++ < tries && S().game_time_sec < maxGameSec) {
      expedition(targets, maxGameSec);
    }
  }

  // --- run ---
  A("set_timescale", { scale: timeScale });
  A("light_fire");
  tick(50);
  gatherLoop(S().game_time_sec + 25000, () => S().unlocked.path && bld("hut") >= 1);

  if (!S().slice_complete && S().unlocked.path) {
    packFood(8);
    A("embark");
    walkTo("old_house", maxGameSec);
    goHome(maxGameSec);
  }

  gatherLoop(S().game_time_sec + 40000, () => (
    bld("lodge") > 0 && bld("tannery") > 0 && bld("smokehouse") > 0 &&
    store("leather") >= 100 && store("cured_meat") >= 20 && store("scales") >= 10
  ));

  if (bld("workshop") < 1 && store("wood") >= 800 && store("leather") >= 100 && store("scales") >= 10) {
    tryBuild("workshop");
  }
  gatherLoop(S().game_time_sec + 20000, () => store("waterskin") > 0 && bld("workshop") > 0);

  tryUntil(() => S().flags.cleared_iron_mine, ["iron_mine"], 3);
  tryUntil(() => S().flags.cleared_coal_mine, ["coal_mine"], 3);

  assign("iron_miner", 0);
  assign("coal_miner", 0);
  gatherLoop(S().game_time_sec + 25000, () => store("cask") > 0 || store("water_tank") > 0);
  if (store("cask") < 1 && store("leather") >= 100 && store("iron") >= 20) {
    A("travel", { area: "room" });
    A("build", { kind: "cask" });
  }
  if (store("wagon") < 1 && store("wood") >= 500 && store("iron") >= 100) {
    A("travel", { area: "room" });
    A("build", { kind: "wagon" });
  }
  gatherLoop(S().game_time_sec + 25000, () => (
    store("cured_meat") >= 40 &&
    (store("cask") > 0 || store("water_tank") > 0) &&
    (store("wagon") > 0 || store("rucksack") > 0)
  ));

  tryUntil(() => S().flags.cleared_sulphur_mine, ["sulphur_mine"], 4);
  tryUntil(() => S().flags.cleared_dungeon || S().flags.entered_dungeon, ["dungeon"], 4);
  tryUntil(() => S().unlocked.ship, ["crashed_ship"], 4);
  if (!S().flags.blueprint_plasma_rifle) expedition(["ruined_city"], maxGameSec);
  if (!S().flags.blueprint_kinetic_armour) expedition(["battlefield"], maxGameSec);

  if (S().unlocked.fabricator) {
    A("travel", { area: "fabricator" });
    if (store("alien_alloy") >= 1) A("fabricate", { kind: "energy_blade" });
  }

  if (S().unlocked.ship) {
    A("travel", { area: "ship" });
    while (store("alien_alloy") > 0 && (S().ship.hull || 0) < 4 && S().game_time_sec < maxGameSec) {
      A("reinforce_hull");
    }
    if ((S().ship.hull || 0) >= 1) A("liftoff");
  }

  if (S().location === "space") {
    let hops = 0;
    while (!S().ending_reached && hops++ < 80) {
      const alt = S().space.altitude || 0;
      const speed = 3 + (S().ship.thrusters || 1);
      const nextAlt = alt + speed;
      const rockX = ((Math.floor(nextAlt / speed) * 7 + 3) % 5) - 2;
      const x = S().space.x || 0;
      const dx = x === rockX ? (x >= 0 ? -1 : 1) : 0;
      A("space_steer", { dx });
    }
  }

  if (S().ending_reached) A("prestige");

  const missing = STAGES.filter((id) => !stages[id]);
  stuck.missing = stuck.missing.concat(missing.map((id) => "stage:" + id));
  if (missing.length) {
    stuck.room = S().location;
    stuck.event = S().active_event ? S().active_event.id : null;
    stuck.flag_snapshot = {
      builder_level: S().builder_level,
      buildings: { ...S().buildings },
      unlocked: { ...S().unlocked },
      flags: Object.fromEntries(Object.entries(S().flags).filter(([k]) => !k.startsWith("goal") && !k.startsWith("_"))),
      stores: Object.fromEntries(Object.entries(S().stores).filter(([, v]) => v > 0)),
      ending_reached: S().ending_reached,
      slice_complete: S().slice_complete,
      prestige_runs: S().prestige && S().prestige.runs
    };
  }

  return {
    stages,
    missing,
    stuck,
    final: S().phase,
    location: S().location,
    ending_reached: !!S().ending_reached,
    prestige_runs: (S().prestige && S().prestige.runs) || 0,
    slice_complete: !!S().slice_complete,
    game_time_sec: Math.round(S().game_time_sec),
    wall_ms: Math.round(performance.now() - wall0),
    time_scale: g.timeScale,
    unexpected_errors: errors,
    landmarks: S().world.landmarks
  };
}

export function runPlaythrough({ seed = 7 } = {}) {
  const suite = emptySuite("playthrough");
  const res = playFull({ seed });
  for (const st of STAGES) {
    const hit = res.stages[st];
    const check = {
      id: st,
      trigger: st,
      expected: "reached",
      actual: hit
        ? `reached @${hit.t}s game / ${hit.wall_ms}ms wall via ${hit.via}`
        : `not reached (final ${res.final} loc=${res.location})`
    };
    if (hit) ok(suite, check);
    else fail(suite, { ...check, detail: JSON.stringify(res.stuck) });
  }
  suite.report = {
    ending_reachable: res.ending_reached,
    prestige_runs: res.prestige_runs,
    game_time_sec: res.game_time_sec,
    wall_ms: res.wall_ms,
    time_scale: res.time_scale,
    stages: res.stages,
    stuck: res.stuck,
    missing: res.missing
  };
  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const maxI = process.argv.indexOf("--max-game-sec");
  const seedI = process.argv.indexOf("--seed");
  const res = playFull({
    maxGameSec: maxI > 0 ? Number(process.argv[maxI + 1]) : 120000,
    seed: seedI > 0 ? Number(process.argv[seedI + 1]) : 7
  });
  const suite = emptySuite("playthrough");
  for (const st of STAGES) {
    const hit = res.stages[st];
    if (hit) ok(suite, { id: st, actual: `@${hit.t}s / ${hit.wall_ms}ms` });
    else fail(suite, { id: st, detail: JSON.stringify(res.stuck) });
  }
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, report: res }, null, 2));
  process.exit(summary.exitCode);
}
