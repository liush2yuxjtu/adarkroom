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
import { makeSandbox, loadEvents, tickGame } from "./lib/engine-sandbox.mjs";
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
  const afford = (c) => !c || Object.entries(c).every(([k, v]) => {
    const have = (S().stores[k] || 0) + (S().world && S().world.on_expedition ? (S().outfit[k] || 0) : 0);
    return have >= v;
  });
  function drainEvents(max = 16) {
    let n = 0;
    while ((S().active_event || S().combat) && n++ < max) resolve();
  }
  function resolve() {
    const e = S().active_event;
    if (S().combat) {
      const food = (S().outfit.cured_meat || 0) + (S().outfit.meat || 0);
      const dmg = S().combat.dmg || 1;
      if (S().world.hp <= dmg + 2 && food > 0) {
        A("combat", { move: "eat" });
        return;
      }
      if (S().world.hp <= dmg && food <= 0) {
        A("combat", { move: "flee" });
        return;
      }
      const armed = ["bayonet", "steel_sword", "iron_sword", "bone_spear"].find(
        (w) => (S().outfit[w] || 0) + (S().stores[w] || 0) > 0
      );
      A("combat", { move: armed || "punch" });
      return;
    }
    if (!e) return;
    const sp = events[e.id];
    const sc = e.scene && sp.scenes && sp.scenes[e.scene] ? sp.scenes[e.scene] : sp;
    const okb = (sc.buttons || []).filter((x) => afford(x.cost)).map((x) => x.id);
    const pick = ["take", "enter", "continue", "explore", "attack", "talk", "squeeze", "salvage", "leavel", "buy_compass", "goodbye", "leave", "back", "home", "ignore", "wait", "mourn", "deny", "end", "bye", "heal", "spare", "nothing"].find((x) => okb.includes(x)) || okb[0];
    if (pick) A("event_choice", { button: pick });
  }
  function tick(sec) {
    for (let i = 0; i < Math.ceil(sec / 0.25); i++) {
      sb.advance(250);
      g.tick(0.25);
      if ((S().active_event || S().combat) && !S().world.on_expedition) resolve();
      rec("tick");
    }
  }
  const warm = () => { if (S().fire < 2 && (S().stores.wood || 0) > 0) { A("travel", { area: "room" }); A("stoke_fire"); } };

  A("light_fire");
  tick(50);
  const village = { lodge: false, smokehouse: false, charcutier: false, cured_meat: 0, packed: 0 };
  function villageActs() {
    drainEvents();
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
  function packAndEmbark() {
    drainEvents();
    A("travel", { area: "path" });
    if ((S().stores.cured_meat || 0) > 0) A("pack", { item: "cured_meat", amount: S().stores.cured_meat || 0 });
    if ((S().stores.meat || 0) > 0) A("pack", { item: "meat", amount: S().stores.meat || 0 });
    village.packed = Math.max(village.packed, S().outfit.cured_meat || 0);
    const until = S().flags.world_death_until;
    if (until != null && S().game_time_sec < until) tick(until - S().game_time_sec + 1);
    drainEvents();
    A("embark");
  }
  const PATH = [[1, 0], [1, 0], [1, 0], [0, -1], [0, -1], [0, 1], [0, 1], [-1, 0], [-1, 0], [-1, 0]];
  function walkPath() {
    for (const [dx, dy] of PATH) {
      if (!S().world.on_expedition) break;
      A("world_move", { dx, dy });
      drainEvents(80);
    }
  }
  packAndEmbark();
  walkPath();
  for (let retry = 0; !S().slice_complete && retry < 5 && S().game_time_sec < maxGameSec; retry++) {
    villageActs();
    tick(8);
    packAndEmbark();
    walkPath();
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

/** Headless batch-4 room / outside / global / marketing events. */
export function villageEventsPlaythrough() {
  const sb = makeSandbox({ seed: 4 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  s.builder_level = 4;
  s.temperature = 4;
  s.fire = 4;
  s.wood_initialized = true;
  s.unlocked.outside = true;
  s.unlocked.world = true;
  s.location = "room";
  Object.assign(s.stores, {
    wood: 2000, fur: 2000, scales: 80, teeth: 80, cloth: 0,
    medicine: 8, cured_meat: 120, torch: 2
  });
  s.buildings.hut = 6;
  s.population = 20;
  const spawned = {};
  const spawn = (id) => {
    s.active_event = null;
    const r = g.applyCalls([{ tool: "spawn_event", args: { event_id: id } }], "test");
    spawned[id] = !!(s.active_event && s.active_event.id === id);
    return r;
  };
  spawn("beggar");
  const furBefore = s.stores.fur;
  const scalesBefore = s.stores.scales || 0;
  const teethBefore = s.stores.teeth || 0;
  const clothBefore = s.stores.cloth || 0;
  g.act("event_choice", { button: "give50" });
  const beggarRewarded = (
    s.stores.scales === scalesBefore + 20
    || s.stores.teeth === teethBefore + 20
    || s.stores.cloth === clothBefore + 20
  ) && s.stores.fur === furBefore - 50;
  g.act("event_choice", { button: "leave" });

  spawn("shady_builder");
  const hutsBefore = s.buildings.hut;
  const woodBefore = s.stores.wood;
  g.act("event_choice", { button: "build" });
  const shadyPaid = s.stores.wood === woodBefore - 300;
  const shadyEnded = s.active_event && (s.active_event.scene === "steal" || s.active_event.scene === "built");
  if (s.active_event) g.act("event_choice", { button: "end" });
  const shadyOk = shadyPaid && shadyEnded && (s.buildings.hut === hutsBefore || s.buildings.hut === hutsBefore + 1);

  spawn("mysterious_wanderer");
  const wWood = s.stores.wood;
  g.act("event_choice", { button: "wood100" });
  const wandererPaid = s.stores.wood === wWood - 100;
  tickGame(sb, g, 61);
  const wandererNote = s.notifications.some((n) => /神秘的流浪者回来了/.test(n.text || ""));
  if (s.active_event) g.act("event_choice", { button: "leave" });

  spawn("scout");
  const scoutFur = s.stores.fur;
  g.act("event_choice", { button: "buyMap" });
  const scoutPaid = s.stores.fur === scoutFur - 200 && (s.flags.map_pieces || 0) >= 1;
  g.act("event_choice", { button: "leave" });

  spawn("master");
  g.act("event_choice", { button: "agree" });
  g.act("event_choice", { button: "evasion" });
  const masterLearned = !!s.flags.learned_evasive && !s.active_event;

  spawn("sick_man");
  const medBefore = s.stores.medicine;
  g.act("event_choice", { button: "help" });
  const sickPaid = s.stores.medicine === medBefore - 1;
  if (s.active_event) g.act("event_choice", { button: "bye" });

  s.location = "outside";
  s.population = 55;
  s.buildings.hut = 8;
  spawn("fire");
  const hutsAfterFire = s.buildings.hut;
  const fireDestroyedHut = hutsAfterFire === 7;
  if (s.active_event) g.act("event_choice", { button: "mourn" });

  s.population = 20;
  spawn("sickness");
  g.act("event_choice", { button: "heal" });
  const sicknessHealed = !s.active_event || s.active_event.scene === "healed";
  if (s.active_event) g.act("event_choice", { button: "end" });

  s.population = 55;
  spawn("plague");
  g.act("event_choice", { button: "heal" });
  if (s.active_event) g.act("event_choice", { button: "end" });
  const plagueResolved = !s.active_event;

  s.flags.city_cleared = true;
  spawn("military_raid");
  const raidBullets = (s.stores.bullets || 0) >= 10;
  if (s.active_event) g.act("event_choice", { button: "end" });

  s.flags.thieves = 1;
  s.flags.stolen = { wood: 40, fur: 20 };
  const woodAtThief = s.stores.wood;
  spawn("thief");
  g.act("event_choice", { button: "kill" });
  if (s.active_event) g.act("event_choice", { button: "leave" });
  const thiefReturned = s.flags.thieves === 2 && s.stores.wood === woodAtThief + 40;

  s.location = "room";
  spawn("penrose");
  g.act("event_choice", { button: "give_in" });
  const penroseFlag = !!s.flags.marketing_penrose && !s.active_event;

  const needed = [
    "beggar", "shady_builder", "mysterious_wanderer", "scout", "master",
    "sick_man", "fire", "sickness", "plague", "military_raid", "thief", "penrose"
  ];
  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  return {
    spawned,
    allSpawned: needed.every((id) => spawned[id]),
    beggarRewarded,
    shadyOk,
    wandererPaid,
    wandererNote,
    scoutPaid,
    masterLearned,
    sickPaid,
    fireDestroyedHut,
    sicknessHealed,
    plagueResolved,
    raidBullets,
    thiefReturned,
    penroseFlag,
    persistThieves: hydrated.flags.thieves === 2,
    persistPenrose: !!hydrated.flags.marketing_penrose
  };
}

/** Headless batch-5 world map, weapons, perks, encounters. */
export function worldCombatPlaythrough() {
  const sb = makeSandbox({ seed: 5 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  const size = s.world.size;
  const radiusOk = size === 61 || size === 30;
  s.unlocked.path = true;
  s.unlocked.world = true;
  s.stores.cured_meat = 20;
  s.stores.bone_spear = 1;
  s.stores.iron_sword = 1;
  s.stores.laser_rifle = 1;
  s.stores.plasma_rifle = 1;
  s.stores.energy_blade = 1;
  s.stores.disruptor = 1;
  g.act("pack", { item: "cured_meat", amount: 8 });
  g.act("embark");
  const atVillage = s.world.x === 30 && s.world.y === 30 && s.world.on_expedition;
  const weapons = sb.ADR.WEAPONS;
  const weaponOk = !!(weapons && weapons.laser_rifle && weapons.laser_rifle.damage === 8 && weapons.bolas.damage === "stun" && weapons.bone_spear.cooldown === 2);
  const spawned = {};
  ["gaunt_man", "strange_bird", "two_headed_creature", "shivering_man", "man_eater", "scavenger", "huge_lizard", "feral_terror", "soldier", "sniper", "snarling_beast"].forEach((id) => {
    s.combat = null;
    s.active_event = null;
    g.applyCalls([{ tool: "spawn_event", args: { event_id: id } }], "test");
    spawned[id] = !!(s.combat && s.active_event && s.active_event.id === id);
    g.act("combat", { move: "flee" });
  });
  sb.ADR.addPerk(s, "boxer");
  sb.ADR.addPerk(s, "martial_artist");
  sb.ADR.addPerk(s, "unarmed_master");
  sb.ADR.addPerk(s, "barbarian");
  sb.ADR.addPerk(s, "slow_metabolism");
  sb.ADR.addPerk(s, "desert_rat");
  sb.ADR.addPerk(s, "evasive");
  sb.ADR.addPerk(s, "precise");
  sb.ADR.addPerk(s, "scout");
  sb.ADR.addPerk(s, "stealthy");
  sb.ADR.addPerk(s, "gastronome");
  const allPerks = ["boxer", "martial_artist", "unarmed_master", "barbarian", "slow_metabolism", "desert_rat", "evasive", "precise", "scout", "stealthy", "gastronome"].every((k) => s.perks[k]);
  s.combat = { hp: 100, dmg: 0, hit: 0, name: "t", death: "x" };
  s.world.max_hp = 45;
  s.world.hp = 20;
  const enemyHp = s.combat.hp;
  for (let i = 0; i < 8; i++) g.act("combat", { move: "punch" });
  const perkDmg = enemyHp - (s.combat ? s.combat.hp : 0);
  s.combat = { hp: 4, dmg: 1, name: "t", death: "x" };
  s.world.hp = 10;
  g.act("combat", { move: "eat" });
  const ate = s.world.hp > 10;
  const villageNoFight = !sb.ADR.eventAvailable(s, events.snarling_beast);
  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  return {
    radiusOk,
    size,
    atVillage,
    weaponOk,
    allEncounters: Object.keys(spawned).every((k) => spawned[k]),
    spawned,
    allPerks,
    perkDmg,
    perkPunch: perkDmg >= 24,
    persistBoxer: !!hydrated.perks.boxer,
    persistSize: hydrated.world.size === size,
    fightChance: sb.ADR.FIGHT_CHANCE === 0.2,
    meatHeal: sb.ADR.MEAT_HEAL === 8,
    ate,
    villageNoFight
  };
}

/** Headless batch-6 landmarks / setpieces: placement, scenes, flags, mines, persist. */
export function landmarksPlaythrough() {
  const sb = makeSandbox({ seed: 6 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  const ids = [
    "old_house", "cave", "town", "city", "outpost", "ship", "borehole",
    "battlefield", "swamp", "cache", "executioner", "ironmine", "coalmine", "sulphurmine"
  ];
  const placed = Object.values(s.world.landmarks || {});
  const allPlaced = ids.every((id) => placed.includes(id));
  const allEvents = ids.every((id) => !!events[id] && events[id].scenes && events[id].scenes.start);
  const storyTiles = ["31,30", "32,30", "33,30", "33,29"];
  const extraOnStory = storyTiles.filter((k) => s.world.landmarks[k] && s.world.landmarks[k] !== "old_house");
  s.unlocked.path = true;
  s.unlocked.world = true;
  Object.assign(s.stores, { cured_meat: 40, torch: 12, charm: 2, bone_spear: 1 });
  g.act("pack", { item: "cured_meat", amount: 20 });
  g.act("pack", { item: "torch", amount: 8 });
  g.act("pack", { item: "charm", amount: 1 });
  g.act("pack", { item: "bone_spear", amount: 1 });
  g.act("embark");
  const spawned = {};
  const spawn = (id) => {
    s.active_event = null;
    s.combat = null;
    g.applyCalls([{ tool: "spawn_event", args: { event_id: id } }], "test");
    spawned[id] = !!(s.active_event && s.active_event.id === id);
    return spawned[id];
  };
  const fight = () => {
    let n = 0;
    while (s.combat && n++ < 80) {
      if (s.world.hp <= (s.combat.dmg || 1) + 2 && ((s.outfit.cured_meat || 0) + (s.outfit.meat || 0)) > 0) {
        g.act("combat", { move: "eat" });
      } else {
        g.act("combat", { move: (s.outfit.bone_spear || 0) > 0 ? "bone_spear" : "punch" });
      }
    }
  };
  const pick = (btn) => g.act("event_choice", { button: btn });

  s.world.water = 1;
  spawn("outpost");
  const outpostWater = s.world.water >= sb.ADR.getMaxWater(s);

  spawn("swamp");
  pick("enter");
  pick("talk");
  const swampPerk = !!s.perks.gastronome;
  if (s.active_event) pick("leave");

  spawn("ironmine");
  pick("enter");
  if (s.combat) fight();
  if (s.active_event) pick("leave");
  if (s.active_event) pick("leave");
  const ironFlag = !!(s.flags.world_ironmine);

  spawn("coalmine");
  const coalStart = !!(s.active_event && s.active_event.id === "coalmine");
  if (events.coalmine.scenes.cleared) {
    sb.ADR.applySceneEffects(s, events.coalmine.scenes.cleared);
  }
  const coalFlag = !!(s.flags.world_coalmine);

  spawn("sulphurmine");
  if (events.sulphurmine.scenes.cleared) {
    sb.ADR.applySceneEffects(s, events.sulphurmine.scenes.cleared);
  }
  const sulphurFlag = !!(s.flags.world_sulphurmine);

  spawn("city");
  const cityStart = !!(s.active_event && s.active_event.id === "city");
  const cityEnd = events.city.scenes.end1 || Object.values(events.city.scenes).find((sc) => sc.onload && sc.onload.city_cleared);
  if (cityEnd) sb.ADR.applySceneEffects(s, cityEnd);
  const cityCleared = !!s.flags.city_cleared;

  spawn("ship");
  const shipFlag = !!(s.flags.world_ship);
  if (s.active_event) pick("leavel");
  if (s.active_event) pick("leave");

  spawn("cave");
  const caveStart = !!(s.active_event && events.cave.scenes.start);
  if (s.active_event) pick("leave");

  spawn("town");
  if (s.active_event) pick("leave");
  spawn("battlefield");
  if (s.active_event) pick("leave");
  spawn("borehole");
  if (s.active_event) pick("leave");
  spawn("cache");
  if (s.active_event) pick("enter");
  if (s.active_event) pick("take");
  if (s.active_event) pick("leave");
  spawn("executioner");
  const executionerStart = !!(s.active_event && s.active_event.id === "executioner");
  if (s.active_event) pick("leave");

  spawn("old_house");
  pick("enter");
  if (s.combat) fight();
  if (s.active_event) pick("leave");
  const houseVisited = !!s.flags.visited_old_house;

  s.world.x = 30;
  s.world.y = 29;
  s.active_event = null;
  s.combat = null;
  g.act("world_move", { dx: 0, dy: 1 });
  const minesBuilt = s.buildings.iron_mine === 1 && s.buildings.coal_mine === 1 && s.buildings.sulphur_mine === 1;
  const noShipArea = !sb.ADR.AREAS || sb.ADR.AREAS.indexOf("ship") < 0;

  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  return {
    allPlaced,
    allEvents,
    storyPathClean: extraOnStory.length === 0,
    extraOnStory,
    spawned,
    allSpawned: ids.every((id) => spawned[id]),
    outpostWater,
    swampPerk,
    ironFlag,
    coalStart,
    coalFlag,
    sulphurFlag,
    cityStart,
    cityCleared,
    shipFlag,
    caveStart,
    executionerStart,
    houseVisited,
    minesBuilt,
    noShipArea,
    persistLandmarks: Object.values(hydrated.world.landmarks || {}).includes("ironmine"),
    persistCity: !!hydrated.flags.city_cleared,
    persistIronMine: hydrated.buildings.iron_mine === 1,
    persistShip: !!hydrated.flags.world_ship
  };
}

/** Headless batch-3 trading post: costs, seen-unlock, compass max 1. */
export function tradingPlaythrough() {
  const sb = makeSandbox({ seed: 3 });
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, {});
  const s = g.state;
  s.builder_level = 4;
  s.temperature = 4;
  s.fire = 4;
  s.wood_initialized = true;
  s.location = "room";
  Object.assign(s.stores, { fur: 8000, scales: 2000, teeth: 800 });
  s.seen.fur = true;
  s.seen.scales = true;
  s.seen.teeth = true;
  const noPost = g.act("buy", { kind: "scales" });
  s.buildings.trading_post = 1;
  const hiddenMed = g.act("buy", { kind: "medicine" });
  const kinds = [
    "scales", "teeth", "iron", "coal", "steel", "bullets",
    "energy_cell", "bolas", "grenade", "bayonet", "alien_alloy", "compass"
  ];
  kinds.forEach((k) => { s.seen[k] = true; });
  s.seen.medicine = true;
  const bought = {};
  kinds.concat(["medicine"]).forEach((kind) => {
    const r = g.act("buy", { kind });
    bought[kind] = !!(r && r.ok && (s.stores[kind] || 0) > 0);
  });
  const compassAgain = g.act("buy", { kind: "compass" });
  const vis = g.visibleTrades ? g.visibleTrades() : sb.ADR.Game.prototype.visibleTrades.call(g);
  return {
    noPostBlocked: !!(noPost && noPost.ok === false),
    medicineHiddenUntilSeen: !!(hiddenMed && hiddenMed.ok === false),
    bought,
    allBought: kinds.concat(["medicine"]).every((k) => bought[k]),
    compassCapped: !!(compassAgain && compassAgain.ok === false),
    compassCost: sb.ADR.tradeCost("compass"),
    ironCost: sb.ADR.tradeCost("iron"),
    listed: vis.map((x) => x.kind)
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
    const bad = Object.keys(res.unexpected_errors).filter((k) => !/^(build:cost|embark:no_food|embark:death_cooldown|combat:|world_move:event_open|pack:|assign_worker:|gather_wood:event_open|check_traps:event_open)/.test(k));
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
