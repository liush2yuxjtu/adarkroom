#!/usr/bin/env node
/**
 * Deterministic full playthrough of the remake engine (godot/build/web/engine.js).
 * Fresh save → village economy → forest → world/combat → mines → executioner →
 * ship/fabricator → space/ending → prestige.
 *
 * Landmark ids and flags match the migrated world: ironmine / coalmine /
 * sulphurmine, flags world_ironmine / world_coalmine / world_sulphurmine,
 * ship, executioner (dungeon stage), ending on state.ending, prestige via restart.
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

/** Village / room events. Leave stays ahead of unlisted landmark buttons. */
const EVENT_PREFER = [
  "take", "enter", "scavenge", "search", "clear", "buy_compass",
  "goodbye", "leave", "back", "home", "ignore", "wait", "mourn"
];

/**
 * World landmarks after the #36 migration. Ids are events.json / world.landmarks
 * values (`ironmine`, not `iron_mine`). `attack`/`continue` must beat `leave`
 * or the mine scenes exit before `world_*` is set.
 */
const LANDMARK_IDS = new Set([
  "old_house", "cave", "town", "city", "outpost", "ship", "borehole",
  "battlefield", "swamp", "cache", "executioner", "ironmine", "coalmine", "sulphurmine",
  "engineering_wing", "martial_wing", "medical_wing", "command_deck", "liftoff_warning"
]);
const LANDMARK_PREFER = [
  "attack", "take", "take_device", "search", "enter", "continue", "talk",
  "fly", "leavel", "leave"
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
    noteProgress(n);
    stuck.room = S().location;
    stuck.event = S().active_event ? S().active_event.id : null;
    stuck.action = n;
    return r;
  };

  const haveItem = (k) => (S().stores[k] || 0) + (S().world.on_expedition ? (S().outfit[k] || 0) : 0);
  const afford = (c) => !c || Object.entries(c).every(([k, v]) => haveItem(k) >= v);

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
    const prefer = LANDMARK_IDS.has(e.id) ? LANDMARK_PREFER : EVENT_PREFER;
    const pick = prefer.find((x) => okb.includes(x)) || okb[0];
    if (pick) A("event_choice", { button: pick });
  }

  function noteProgress(n) {
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
    if (S().flags.world_ironmine && S().flags.world_coalmine && S().flags.world_sulphurmine) {
      mark("mines", n);
    }
    // The wreck (executioner) replaced the old dungeon landmark.
    if (S().flags.world_executioner || S().flags.executioner_open || S().flags.command_cleared) {
      mark("dungeon", n);
    }
    if (S().unlocked.ship) mark("ship", n);
    if (S().unlocked.fabricator) mark("fabricator", n);
    if (S().location === "space") mark("space", n);
    if (S().ending || S().flags.ending) mark("ending", n);
    if ((S().previous && (S().previous.score || 0) > 0) && !S().ending) mark("prestige", n);
  }

  function tick(sec) {
    const step = 0.25;
    const n = Math.ceil(sec / step);
    for (let i = 0; i < n; i++) {
      sb.advance(step * 1000);
      g.tick(step);
      if (S().active_event && !S().world.on_expedition) resolveEvent();
      if (S().combat) fight();
      noteProgress("tick");
    }
  }

  const warm = () => {
    if (S().fire < 2 && (S().stores.wood || 0) > 0) {
      A("travel", { area: "room" });
      A("stoke_fire");
    }
  };

  function bestWeapon() {
    const order = ["energy_blade", "steel_sword", "bayonet", "iron_sword", "bone_spear"];
    for (const id of order) {
      if ((S().outfit[id] || 0) > 0 || (S().stores[id] || 0) > 0) return id;
    }
    return "punch";
  }

  function fight() {
    const dmg = (S().combat && S().combat.dmg) || 1;
    const food = (S().outfit.cured_meat || 0) + (S().outfit.meat || 0);
    const meds = (S().outfit.medicine || 0) + (S().stores.medicine || 0);
    if (S().world.hp <= dmg && food > 0) A("combat", { move: "eat" });
    else if (S().world.hp <= dmg && meds > 0) A("combat", { move: "meds" });
    else A("combat", { move: bestWeapon() });
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
        if (bld("workshop") > 0 && store("torch") < 2 && store("cloth") >= 1 && store("wood") >= 1) {
          A("travel", { area: "room" });
          A("build", { kind: "torch" });
        }
        if (bld("workshop") > 0 && store("iron_sword") < 1 && store("wood") >= 200 && store("leather") >= 50 && store("iron") >= 20) {
          A("travel", { area: "room" });
          A("build", { kind: "iron_sword" });
        }
        if (bld("workshop") > 0 && store("i_armour") < 1 && store("leather") >= 200 && store("iron") >= 100) {
          A("travel", { area: "room" });
          A("build", { kind: "i_armour" });
        }
        if (bld("steelworks") < 1 && store("wood") >= 1500 && store("iron") >= 100 && store("coal") >= 100) {
          tryBuild("steelworks");
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
        const hunters = Math.min(Math.max(10, Math.floor(pop * 0.7)), Math.max(0, pop - 4));
        assign("hunter", hunters);
        const meatPerTick = hunters * 0.5;
        const processors = Math.max(1, Math.min(3, Math.floor(meatPerTick / 5)));
        if (bld("tannery") > 0) assign("tanner", processors);
        if (bld("smokehouse") > 0) assign("charcutier", processors);
        // Miners eat cured meat 1:1 with a charcutier. Keep a food stock for
        // expeditions, then run at most as many miners as charcutiers.
        const stockFood = store("cured_meat") < 40;
        const slots = stockFood ? 0 : processors;
        const needIron = store("iron") < 180 || store("iron_sword") < 1 || store("i_armour") < 1 || store("water_tank") < 1;
        const needCoal = store("coal") < 160 || (bld("steelworks") > 0 && store("steel") < 50);
        let used = 0;
        if (S().flags.world_ironmine && needIron && used < slots) { assign("iron_miner", 1); used += 1; }
        else assign("iron_miner", 0);
        if (S().flags.world_coalmine && needCoal && used < slots) { assign("coal_miner", 1); used += 1; }
        else assign("coal_miner", 0);
        assign("sulphur_miner", 0);
        if (bld("steelworks") > 0 && store("steel") < 50 && store("iron") > 110 && store("coal") > 20 && !stockFood) {
          assign("steelworker", 1);
        } else assign("steelworker", 0);
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
    if (store("medicine") > 0 && !(S().outfit.medicine > 0)) A("pack", { item: "medicine", amount: 1 });
  }

  function waitDeath() {
    const until = S().flags.world_death_until;
    if (until == null || S().game_time_sec >= until) return;
    const gameLeft = until - S().game_time_sec + 1;
    tick(gameLeft / Math.max(g.timeScale, 0.25) + 0.25);
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
      while ((S().active_event || S().combat) && k0++ < 400) {
        if (S().combat) fight();
        else resolveEvent();
      }
      if (S().world.x === dest.x && S().world.y === dest.y) {
        let k = 0;
        while ((S().active_event || S().combat) && k++ < 400) {
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
      while ((S().active_event || S().combat) && k++ < 400) {
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
      while ((S().active_event || S().combat) && k++ < 400) {
        if (S().combat) fight();
        else resolveEvent();
      }
    }
  }

  function expedition(targets, until) {
    waitDeath();
    if ((store("cured_meat") + store("meat")) < 8) {
      stuck.missing.push("food:" + targets.join(","));
      return false;
    }
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
      if ((store("cured_meat") + store("meat")) < 15) {
        gatherLoop(Math.min(maxGameSec, S().game_time_sec + 8000), () => store("cured_meat") >= 20);
      }
      expedition(targets, maxGameSec);
    }
  }

  function dodgeSpace() {
    const sp = S().space;
    if (!sp || !sp.active) return;
    const threats = (sp.asteroids || []).filter((r) => r.y < sp.shipY + 30 && r.y + (r.h || 0) > sp.shipY - 120);
    if (!threats.length) return;
    const nearest = threats.reduce((a, b) => (Math.abs(a.x - sp.shipX) < Math.abs(b.x - sp.shipX) ? a : b));
    const dir = sp.shipX >= nearest.x ? 1 : -1;
    const roomRight = (700 - 10) - sp.shipX;
    const roomLeft = sp.shipX - 10;
    const dx = dir > 0 ? Math.min(40, roomRight) : -Math.min(40, roomLeft);
    if (dx) A("space_steer", { dx });
  }

  function ascend() {
    let tries = 0;
    while (!S().ending && tries++ < 4 && S().game_time_sec < maxGameSec) {
      if (S().location !== "space") {
        waitDeath();
        A("travel", { area: "ship" });
        if ((S().spaceShip.hull || 0) < 1) break;
        A("lift_off");
        if (S().active_event && S().active_event.id === "liftoff_warning") {
          A("event_choice", { button: "fly" });
        }
        if (S().location !== "space") {
          tick(120 / Math.max(g.timeScale, 0.25) + 0.5);
          continue;
        }
      }
      let guard = 0;
      while (S().location === "space" && !S().ending && guard++ < 240) {
        dodgeSpace();
        tick(0.25);
      }
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
  gatherLoop(S().game_time_sec + 30000, () => (
    bld("workshop") > 0 && store("waterskin") > 0 && store("bone_spear") > 0 &&
    store("torch") >= 1 && store("cured_meat") >= 25 && (store("rucksack") > 0 || store("wagon") > 0)
  ));

  tryUntil(() => S().flags.world_ironmine, ["ironmine"], 4);
  tryUntil(() => S().flags.world_coalmine, ["coalmine"], 4);

  gatherLoop(S().game_time_sec + 80000, () => (
    store("iron_sword") > 0 && store("i_armour") > 0 && store("water_tank") > 0 &&
    (store("wagon") > 0 || store("convoy") > 0) && store("cured_meat") >= 40
  ));

  tryUntil(() => S().flags.world_sulphurmine, ["sulphurmine"], 6);
  if (store("alien_alloy") < 1) tryUntil(() => store("alien_alloy") >= 1, ["borehole"], 3);
  tryUntil(() => S().flags.world_ship, ["ship"], 4);
  tryUntil(() => S().flags.world_executioner, ["executioner"], 4);

  if (S().unlocked.ship) {
    A("travel", { area: "ship" });
    let hullGuard = 0;
    while (store("alien_alloy") > 0 && (S().spaceShip.hull || 0) < 3 && hullGuard++ < 6 && S().game_time_sec < maxGameSec) {
      A("reinforce_hull");
    }
  }
  if (S().unlocked.fabricator && store("alien_alloy") >= 1) {
    A("travel", { area: "fabricator" });
    A("fabricate", { kind: "energy_blade" });
  }
  if (S().unlocked.ship && (S().spaceShip.hull || 0) >= 1) ascend();

  if (S().ending || S().flags.ending) A("restart");

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
      ending: !!S().ending,
      slice_complete: S().slice_complete,
      prestige_score: S().previous && S().previous.score
    };
  }

  const reachedEnding = !!S().ending || !!(S().previous && (S().previous.score || 0) > 0 && stages.ending);
  return {
    stages,
    missing,
    stuck,
    final: S().phase,
    location: S().location,
    ending_reached: reachedEnding,
    prestige_runs: (S().previous && (S().previous.score || 0) > 0 && !S().ending) ? 1 : 0,
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
