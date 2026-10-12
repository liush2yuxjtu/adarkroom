#!/usr/bin/env node
/**
 * Worker income checks: original script/outside.js _INCOME rates over time.
 * Headless engine.js, no network.
 *
 *   node tools/verify/income.mjs
 */
import { fileURLToPath } from "node:url";
import { makeSandbox, tickGame } from "./lib/engine-sandbox.mjs";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";

function village(sb, over = {}) {
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, {});
  const s = g.state;
  s.builder_level = 4;
  s.temperature = 4;
  s.fire = 4;
  s.wood_initialized = true;
  s.unlocked.outside = true;
  s.location = "outside";
  s.phase = "village";
  s.population = 4;
  s.buildings.hut = 1;
  s.buildings.lodge = 1;
  s.buildings.tannery = 1;
  s.buildings.smokehouse = 1;
  s.buildings.steelworks = 1;
  s.buildings.armoury = 1;
  s.buildings.iron_mine = 1;
  s.buildings.coal_mine = 1;
  s.buildings.sulphur_mine = 1;
  s.flags.wake_line = true;
  s.flags.craft_hint_trap = true;
  s.flags.craft_hint_cart = true;
  s.flags.craft_hint_hut = true;
  Object.assign(s.stores, {
    wood: 100,
    fur: 40,
    meat: 40,
    cured_meat: 10,
    leather: 0,
    iron: 10,
    coal: 10,
    steel: 10,
    sulphur: 10,
    bait: 0,
    bullets: 0
  });
  Object.assign(s.workers, {
    gatherer: 4,
    hunter: 0,
    trapper: 0,
    tanner: 0,
    charcutier: 0,
    iron_miner: 0,
    coal_miner: 0,
    sulphur_miner: 0,
    steelworker: 0,
    armourer: 0
  });
  Object.keys(over).forEach((k) => {
    if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k])) Object.assign(s[k], over[k]);
    else s[k] = over[k];
  });
  sb.ADR.syncGatherers(s);
  return g;
}

function near(actual, expected, eps = 1e-6) {
  return Math.abs(Number(actual) - expected) <= eps;
}

export function runIncome() {
  const suite = emptySuite("income");
  const check = (id, fn) => {
    try {
      const r = fn();
      if (r === true || (r && r.pass)) ok(suite, { id, ...(r && r.detail ? { detail: r.detail } : {}) });
      else fail(suite, { id, detail: (r && r.detail) || "check returned false" });
    } catch (e) {
      fail(suite, { id, detail: "threw: " + String(e && e.message || e) });
    }
  };

  check("income-table-matches-original", () => {
    const sb = makeSandbox({ seed: 1 });
    const inc = sb.ADR.INCOME;
    const expect = {
      gatherer: { wood: 1 },
      hunter: { fur: 0.5, meat: 0.5 },
      trapper: { meat: -1, bait: 1 },
      tanner: { fur: -5, leather: 1 },
      charcutier: { meat: -5, wood: -5, cured_meat: 1 },
      iron_miner: { cured_meat: -1, iron: 1 },
      coal_miner: { cured_meat: -1, coal: 1 },
      sulphur_miner: { cured_meat: -1, sulphur: 1 },
      steelworker: { iron: -1, coal: -1, steel: 1 },
      armourer: { steel: -1, sulphur: -1, bullets: 1 }
    };
    for (const [job, stores] of Object.entries(expect)) {
      if (!inc[job] || inc[job].delay !== 10) return { pass: false, detail: `${job} delay` };
      for (const [k, v] of Object.entries(stores)) {
        if (inc[job].stores[k] !== v) return { pass: false, detail: `${job}.${k} ${inc[job].stores[k]} != ${v}` };
      }
    }
    return { pass: true, detail: "10 jobs × delay 10s" };
  });

  check("hunter-20s-two-workers", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.workers.hunter = 2;
    sb.ADR.syncGatherers(g.state);
    const fur0 = g.state.stores.fur;
    const meat0 = g.state.stores.meat;
    tickGame(sb, g, 20);
    // 2 hunters × 0.5 × 2 ticks = +2 fur, +2 meat
    return {
      pass: near(g.state.stores.fur, fur0 + 2) && near(g.state.stores.meat, meat0 + 2),
      detail: `fur ${g.state.stores.fur - fur0} meat ${g.state.stores.meat - meat0}`
    };
  });

  check("charcutier-produces-cured-meat", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.workers.charcutier = 1;
    sb.ADR.syncGatherers(g.state);
    g.state.stores.meat = 20;
    g.state.stores.wood = 20;
    g.state.stores.cured_meat = 0;
    tickGame(sb, g, 10);
    return {
      pass: g.state.stores.cured_meat >= 1 && g.state.stores.meat === 15,
      detail: `cured=${g.state.stores.cured_meat} meat=${g.state.stores.meat} wood=${g.state.stores.wood}`
    };
  });

  check("charcutier-skips-when-short", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.workers.charcutier = 1;
    sb.ADR.syncGatherers(g.state);
    g.state.stores.meat = 3;
    g.state.stores.wood = 20;
    g.state.stores.cured_meat = 0;
    tickGame(sb, g, 20);
    return {
      pass: g.state.stores.cured_meat === 0 && g.state.stores.meat === 3,
      detail: `cured=${g.state.stores.cured_meat} meat=${g.state.stores.meat}`
    };
  });

  check("tanner-leather", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.workers.tanner = 1;
    sb.ADR.syncGatherers(g.state);
    g.state.stores.fur = 10;
    g.state.stores.leather = 0;
    tickGame(sb, g, 10);
    return {
      pass: g.state.stores.leather >= 1 && g.state.stores.fur <= 5,
      detail: `leather=${g.state.stores.leather} fur=${g.state.stores.fur}`
    };
  });

  check("trapper-bait-from-meat", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.workers.trapper = 1;
    sb.ADR.syncGatherers(g.state);
    g.state.stores.meat = 5;
    g.state.stores.bait = 0;
    tickGame(sb, g, 10);
    return {
      pass: g.state.stores.bait >= 1 && g.state.stores.meat <= 4,
      detail: `bait=${g.state.stores.bait} meat=${g.state.stores.meat}`
    };
  });

  check("gatherer-is-residual", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.population = 4;
    g.state.workers.hunter = 2;
    sb.ADR.syncGatherers(g.state);
    const wood0 = g.state.stores.wood;
    tickGame(sb, g, 10);
    // 2 gatherers × 1 wood / 10s, plus builder +2
    const gained = g.state.stores.wood - wood0;
    return {
      pass: g.state.workers.gatherer === 2 && gained >= 2,
      detail: `gatherer=${g.state.workers.gatherer} wood+${gained}`
    };
  });

  check("assign-and-persist", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.population = 4;
    sb.ADR.syncGatherers(g.state);
    const r = g.act("assign_worker", { job: "hunter", delta: 2 });
    g.persistSave(true);
    const sb2 = makeSandbox({ storage: sb.ctx.localStorage });
    const g2 = new sb2.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, {});
    return {
      pass: r.ok && g2.state.workers.hunter === 2 && g2.state.workers.gatherer === 2,
      detail: `ok=${r.ok} hunter=${g2.state.workers.hunter} gatherer=${g2.state.workers.gatherer}`
    };
  });

  check("old-save-migrates-workers", () => {
    const sb = makeSandbox({ seed: 1 });
    const old = sb.ADR.createState();
    old.buildings = { trap: 1, cart: 1, hut: 1 };
    old.workers = { gatherer: 3 };
    old.population = 3;
    old.stores = { wood: 20, fur: 4, meat: 2 };
    const migrated = sb.ADR.hydrateState(old);
    return {
      pass:
        migrated.buildings.lodge === 0 &&
        migrated.buildings.smokehouse === 0 &&
        typeof migrated.workers.charcutier === "number" &&
        migrated.stores.leather === 0 &&
        migrated.stores.iron === 0 &&
        migrated.workers.gatherer === 3,
      detail: `lodge=${migrated.buildings.lodge} charcutier=${migrated.workers.charcutier} leather=${migrated.stores.leather}`
    };
  });

  check("miners-steel-armourer", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb);
    g.state.population = 8;
    g.state.workers.iron_miner = 1;
    g.state.workers.coal_miner = 1;
    g.state.workers.sulphur_miner = 1;
    g.state.workers.steelworker = 1;
    g.state.workers.armourer = 1;
    sb.ADR.syncGatherers(g.state);
    const iron0 = g.state.stores.iron;
    const coal0 = g.state.stores.coal;
    const steel0 = g.state.stores.steel;
    const sulphur0 = g.state.stores.sulphur;
    const bullets0 = g.state.stores.bullets;
    const cured0 = g.state.stores.cured_meat;
    tickGame(sb, g, 10);
    // miners +1 each (cost 1 cured each); steelworker iron-1 coal-1 steel+1; armourer steel-1 sulphur-1 bullets+1
    return {
      pass:
        g.state.stores.iron === iron0 + 1 - 1 &&
        g.state.stores.coal === coal0 + 1 - 1 &&
        g.state.stores.steel === steel0 + 1 - 1 &&
        g.state.stores.sulphur === sulphur0 + 1 - 1 &&
        g.state.stores.bullets === bullets0 + 1 &&
        g.state.stores.cured_meat === cured0 - 3,
      detail: JSON.stringify({
        iron: g.state.stores.iron - iron0,
        coal: g.state.stores.coal - coal0,
        steel: g.state.stores.steel - steel0,
        sulphur: g.state.stores.sulphur - sulphur0,
        bullets: g.state.stores.bullets - bullets0,
        cured: g.state.stores.cured_meat - cured0
      })
    };
  });

  check("locked-until-building", () => {
    const sb = makeSandbox({ seed: 1 });
    const g = village(sb, { buildings: { lodge: 0, smokehouse: 0, tannery: 0, steelworks: 0, armoury: 0, iron_mine: 0, coal_mine: 0, sulphur_mine: 0 } });
    g.state.buildings.hut = 1;
    const r = g.act("assign_worker", { job: "hunter", delta: 1 });
    const r2 = g.act("assign_worker", { job: "charcutier", delta: 1 });
    return {
      pass: !r.ok && r.error === "locked" && !r2.ok,
      detail: `hunter=${r.error} charcutier=${r2.error}`
    };
  });

  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = runIncome();
  const summary = summarize([suite]);
  console.log(JSON.stringify({ summary, results: suite.results }, null, 2));
  process.exit(summary.exitCode);
}
