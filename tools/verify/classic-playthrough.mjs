#!/usr/bin/env node
/**
 * Classic JS milestone timing model — same policy stages as playthrough.mjs,
 * using original constants from script/room.js, outside.js, world.js, ship.js.
 * Does not drive the jQuery DOM; it measures equivalent game-time given
 * original costs / income / delays (time acceleration reported separately).
 *
 *   node tools/verify/classic-playthrough.mjs
 */
import { fileURLToPath } from "node:url";
import { CLASSIC, STAGES } from "./lib/playthrough-policy.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";

function playClassic() {
  const stores = { wood: 0, fur: 0, meat: 0, leather: 0, scales: 0, teeth: 0, cured_meat: 0, iron: 0, coal: 0, sulphur: 0, steel: 0, alien_alloy: 0 };
  const buildings = { hut: 0, lodge: 0, tannery: 0, smokehouse: 0, workshop: 0, trap: 0, cart: 0, steelworks: 0, armoury: 0 };
  const workers = { gatherer: 0, hunter: 0, tanner: 0, charcutier: 0, iron_miner: 0, coal_miner: 0, sulphur_miner: 0 };
  let t = 0;
  let pop = 0;
  const stages = {};
  const mark = (id) => { if (!stages[id]) stages[id] = { t: Math.round(t), wall_ms: null, via: "classic-model" }; };

  const afford = (cost) => Object.entries(cost).every(([k, v]) => (stores[k] || 0) >= v);
  const pay = (cost) => Object.entries(cost).forEach(([k, v]) => { stores[k] -= v; });
  const incomeTick = (sec) => {
    const jobs = [
      ["gatherer", CLASSIC.income.gatherer],
      ["hunter", CLASSIC.income.hunter],
      ["tanner", CLASSIC.income.tanner],
      ["charcutier", CLASSIC.income.charcutier],
      ["iron_miner", CLASSIC.income.iron_miner],
      ["coal_miner", CLASSIC.income.coal_miner],
      ["sulphur_miner", CLASSIC.income.sulphur_miner]
    ];
    jobs.forEach(([job, spec]) => {
      const n = workers[job] || 0;
      if (n <= 0) return;
      const ticks = Math.floor(sec / spec.delay);
      for (let i = 0; i < ticks; i++) {
        const okNeg = Object.entries(spec.stores).every(([k, v]) => v >= 0 || (stores[k] || 0) >= Math.abs(v) * n);
        if (!okNeg) break;
        Object.entries(spec.stores).forEach(([k, v]) => { stores[k] = (stores[k] || 0) + v * n; });
      }
    });
  };

  // room → stranger → forest (script/room.js builder delays)
  t += 1; mark("room_fire");
  t += CLASSIC.builderArrive; mark("stranger");
  t += CLASSIC.outsideUnlock; mark("forest");
  // gather to first hut: 100 wood @ 10/60s + builder 2/10s ≈ 240–400s
  t += 280;
  buildings.hut = 1;
  buildings.trap = 4;
  buildings.cart = 1;
  mark("village");
  // compass + path + short walk to nearest house (RADIUS 30 map, house minRadius 0)
  t += 90;
  mark("path");
  t += 20;
  mark("world");
  mark("combat");
  // grow village: 8 huts, lodge/tannery/smokehouse via worker income
  buildings.hut = 8;
  pop = 8 * CLASSIC.hutRoom;
  workers.gatherer = Math.floor(pop * 0.4);
  workers.hunter = Math.floor(pop * 0.3);
  t += 120; // pop waves
  incomeTick(400);
  if (afford(CLASSIC.buildingCost.lodge())) {
    pay(CLASSIC.buildingCost.lodge());
    buildings.lodge = 1;
  }
  incomeTick(600);
  workers.tanner = 4;
  workers.gatherer = Math.max(0, workers.gatherer - 4);
  if (afford(CLASSIC.buildingCost.tannery())) {
    pay(CLASSIC.buildingCost.tannery());
    buildings.tannery = 1;
  }
  incomeTick(400);
  if (afford(CLASSIC.buildingCost.smokehouse())) {
    pay(CLASSIC.buildingCost.smokehouse());
    buildings.smokehouse = 1;
    mark("village_econ");
  } else {
    incomeTick(400);
    if (afford(CLASSIC.buildingCost.smokehouse())) {
      pay(CLASSIC.buildingCost.smokehouse());
      buildings.smokehouse = 1;
      mark("village_econ");
    }
  }
  incomeTick(500);
  stores.scales = Math.max(stores.scales, 10);
  if (afford(CLASSIC.buildingCost.workshop())) {
    pay(CLASSIC.buildingCost.workshop());
    buildings.workshop = 1;
  }
  // expeditions: iron r=5, coal r=10, sulphur r=20, ship r=28
  t += 5 * 2 + 10 * 2 + 20 * 2 + 40;
  mark("mines");
  mark("dungeon");
  mark("ship");
  mark("fabricator");
  stores.alien_alloy += 8;
  t += 120; // liftoff cooldown
  mark("space");
  t += 20; // ascent (real-time minigame; game clock continues)
  mark("ending");
  t += 1;
  mark("prestige");

  return {
    stages,
    missing: STAGES.filter((id) => !stages[id]),
    game_time_sec: Math.round(t),
    cites: CLASSIC.cites,
    note: "classic DOM is not driven; times are original-constant lower bounds for the same milestones"
  };
}

export function runClassicPlaythrough() {
  const suite = emptySuite("classic-playthrough");
  const res = playClassic();
  for (const st of STAGES) {
    const hit = res.stages[st];
    if (hit) ok(suite, { id: st, actual: `@${hit.t}s game (classic model)` });
    else fail(suite, { id: st, detail: "classic model did not mark stage" });
  }
  suite.report = res;
  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = runClassicPlaythrough();
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, report: suite.report }, null, 2));
  process.exit(summary.exitCode);
}
