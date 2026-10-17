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
  const shipUnlockedOnReturn = !!(s.unlocked.ship && s.spaceShip);

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
    shipUnlockedOnReturn,
    persistLandmarks: Object.values(hydrated.world.landmarks || {}).includes("ironmine"),
    persistCity: !!hydrated.flags.city_cleared,
    persistIronMine: hydrated.buildings.iron_mine === 1,
    persistShip: !!hydrated.flags.world_ship
  };
}

/** Headless batch-7 ship unlock / hull / lift-off / space ascent. */
export function shipSpacePlaythrough() {
  const sb = makeSandbox({ seed: 7 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  const A = (n, a = {}) => g.act(n, a);
  s.unlocked.path = true;
  s.unlocked.world = true;
  s.flags.world_ship = true;
  Object.assign(s.stores, { cured_meat: 20 });
  A("pack", { item: "cured_meat", amount: 8 });
  A("embark");
  s.world.x = 30;
  s.world.y = 29;
  A("world_move", { dx: 0, dy: 1 });
  const unlockedOnReturn = !!(s.unlocked.ship && s.unlocked.space && s.spaceShip);
  const travel = A("travel", { area: "ship" });
  const seenShip = !!(s.spaceShip && s.spaceShip.seenShip);
  const seenNote = s.notifications.some((n) => /碎片云|流浪者舰队/.test(n.text));
  const noHull = A("lift_off");
  s.stores.alien_alloy = 4;
  const reinforce = A("reinforce_hull");
  const hull1 = s.spaceShip.hull === 1 && s.stores.alien_alloy === 3;
  const upgrade = A("upgrade_engine");
  const thrust2 = s.spaceShip.thrusters === 2 && s.stores.alien_alloy === 2;
  s.stores.alien_alloy = 0;
  A("reinforce_hull");
  s.stores.alien_alloy = 1;
  A("reinforce_hull");
  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  const persistHull = hydrated.spaceShip && hydrated.spaceShip.hull === 2;
  const persistThrust = hydrated.spaceShip && hydrated.spaceShip.thrusters === 2;
  const firstLift = A("lift_off");
  const warningOpen = !!(s.active_event && s.active_event.id === "liftoff_warning");
  const linger = A("event_choice", { button: "linger" });
  const lingered = s.location === "ship" && !s.spaceShip.seenWarning && !s.active_event;
  const lift2 = A("lift_off");
  const warning2 = !!(s.active_event && s.active_event.id === "liftoff_warning");
  A("event_choice", { button: "fly" });
  const inSpace = s.location === "space" && !!(s.space && s.space.active) && !!s.spaceShip.seenWarning;
  const alt0 = s.space ? s.space.altitude : -1;
  tickGame(sb, g, 2, 0.25);
  const altitudeUp = !!(s.space && s.space.altitude >= 2);
  s.space.hull = 1;
  s.space.asteroids = [{ x: s.space.shipX, y: s.space.shipY, w: 20, h: 16, glyph: "#", vy: 0 }];
  tickGame(sb, g, 0.25, 0.05);
  const crashed = s.location === "ship" && !(s.space && s.space.active);
  const afterCrash = A("lift_off");
  const cooldownBlocked = !!(afterCrash && afterCrash.ok === false);
  tickGame(sb, g, 120, 1);
  s.spaceShip.hull = 40;
  const lift3 = A("lift_off");
  const noWarn = !s.active_event && s.location === "space";
  tickGame(sb, g, 61, 0.5);
  const escaped = !!s.flags.space_escaped;
  const consts = {
    LIFTOFF_COOLDOWN: sb.ADR.LIFTOFF_COOLDOWN === 120,
    ALLOY_PER_HULL: sb.ADR.ALLOY_PER_HULL === 1,
    ALLOY_PER_THRUSTER: sb.ADR.ALLOY_PER_THRUSTER === 1,
    BASE_HULL: sb.ADR.BASE_HULL === 0,
    BASE_THRUSTERS: sb.ADR.BASE_THRUSTERS === 1,
    SHIP_SPEED: sb.ADR.SHIP_SPEED === 3,
    BASE_ASTEROID_DELAY: sb.ADR.BASE_ASTEROID_DELAY === 500,
    BASE_ASTEROID_SPEED: sb.ADR.BASE_ASTEROID_SPEED === 1500,
    FTB_SPEED: sb.ADR.FTB_SPEED === 60000
  };
  return {
    unlockedOnReturn,
    travelOk: !!(travel && travel.ok),
    seenShip,
    seenNote,
    noHullBlocked: !!(noHull && noHull.ok === false),
    reinforceOk: !!(reinforce && reinforce.ok),
    hull1,
    upgradeOk: !!(upgrade && upgrade.ok),
    thrust2,
    noAlloyNote: s.notifications.some((n) => /外星合金不足/.test(n.text)),
    persistHull,
    persistThrust,
    firstLiftOk: !!(firstLift && firstLift.ok),
    warningOpen,
    lingerOk: !!(linger && linger.ok) && lingered,
    lift2Ok: !!(lift2 && lift2.ok),
    warning2,
    inSpace,
    alt0,
    altitudeUp,
    crashed,
    cooldownBlocked,
    lift3Ok: !!(lift3 && lift3.ok),
    noWarn,
    escaped,
    consts,
    constsOk: Object.values(consts).every(Boolean),
    persistEscaped: !!sb.ADR.hydrateState(JSON.parse(JSON.stringify(s))).flags.space_escaped
  };
}

/** Headless batch-8 fabricator: executioner salvage, redeem, crafts, persist. */
export function fabricatorPlaythrough() {
  const sb = makeSandbox({ seed: 8 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  const A = (n, a = {}) => g.act(n, a);
  s.unlocked.path = true;
  s.unlocked.world = true;
  Object.assign(s.stores, { cured_meat: 20 });
  A("pack", { item: "cured_meat", amount: 8 });
  A("embark");
  s.active_event = null;
  s.combat = null;
  g.applyCalls([{ tool: "spawn_event", args: { event_id: "executioner" } }], "test");
  const flagOnVisit = !!(s.flags.world_executioner);
  A("event_choice", { button: "search" });
  const lootKeys = [
    "hypo_blueprint", "kinetic_armour_blueprint", "disruptor_blueprint",
    "plasma_rifle_blueprint", "stim_blueprint", "glowstone_blueprint",
    "fleet_beacon", "laser_rifle"
  ];
  const lootOk = lootKeys.every((k) => (s.outfit[k] || 0) > 0);
  A("event_choice", { button: "take" });
  s.world.x = 30;
  s.world.y = 29;
  s.active_event = null;
  s.combat = null;
  A("world_move", { dx: 0, dy: 1 });
  const unlockedOnReturn = !!s.unlocked.fabricator;
  const bpKeys = ["hypo", "kinetic_armour", "disruptor", "plasma_rifle", "stim", "glowstone"];
  const redeemed = bpKeys.every((k) => !!(s.blueprints && s.blueprints[k]));
  const redeemNote = s.notifications.some((n) => /蓝图送进制造机|possibilities grow/.test(n.text));
  const builderNote = s.notifications.some((n) => /一眼认出|doesn’t ask where it came from|doesn't ask where it came from/.test(n.text));
  const laserHome = (s.stores.laser_rifle || 0) > 0;
  const beaconHome = (s.stores.fleet_beacon || 0) > 0;
  const travel = A("travel", { area: "fabricator" });
  const seenNote = s.notifications.some((n) => /熟悉的流浪者机械|finally, real tools/.test(n.text));
  s.blueprints.kinetic_armour = false;
  s.stores.alien_alloy = 2;
  const noBp = A("fabricate", { kind: "kinetic_armour" });
  s.blueprints.kinetic_armour = true;
  const kinds = [
    "energy_blade", "fluid_recycler", "cargo_drone", "kinetic_armour",
    "disruptor", "hypo", "stim", "plasma_rifle", "glowstone"
  ];
  s.stores.alien_alloy = 20;
  const fabricated = {};
  kinds.forEach((kind) => {
    const r = A("fabricate", { kind });
    fabricated[kind] = !!(r && r.ok && (s.stores[kind] || 0) > 0);
  });
  const hypoQty5 = s.stores.hypo === 5;
  s.stores.alien_alloy = 2;
  const maxAgain = A("fabricate", { kind: "cargo_drone" });
  const bladeNote = s.notifications.some((n) => /刃身嗡鸣|charged particles sparking/.test(n.text));
  const bag110 = sb.ADR.bagCapacity(s) === 110;
  const water110 = sb.ADR.getMaxWater(s) === 110;
  const hp85 = sb.ADR.getMaxHealth(s) === 85;
  const costs = {
    energy_blade: sb.ADR.fabricateCost("energy_blade"),
    fluid_recycler: sb.ADR.fabricateCost("fluid_recycler"),
    cargo_drone: sb.ADR.fabricateCost("cargo_drone"),
    kinetic_armour: sb.ADR.fabricateCost("kinetic_armour"),
    disruptor: sb.ADR.fabricateCost("disruptor"),
    hypo: sb.ADR.fabricateCost("hypo"),
    stim: sb.ADR.fabricateCost("stim"),
    plasma_rifle: sb.ADR.fabricateCost("plasma_rifle"),
    glowstone: sb.ADR.fabricateCost("glowstone")
  };
  const costsOk = costs.energy_blade && costs.energy_blade.alien_alloy === 1
    && costs.fluid_recycler && costs.fluid_recycler.alien_alloy === 2
    && costs.cargo_drone && costs.cargo_drone.alien_alloy === 2
    && costs.kinetic_armour && costs.kinetic_armour.alien_alloy === 2
    && costs.disruptor && costs.disruptor.alien_alloy === 1
    && costs.hypo && costs.hypo.alien_alloy === 1
    && costs.stim && costs.stim.alien_alloy === 1
    && costs.plasma_rifle && costs.plasma_rifle.alien_alloy === 1
    && costs.glowstone && costs.glowstone.alien_alloy === 1;
  const locked = A("fabricate", { kind: "no_such_thing" });
  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  return {
    flagOnVisit,
    lootOk,
    unlockedOnReturn,
    redeemed,
    redeemNote,
    builderNote,
    laserHome,
    beaconHome,
    travelOk: !!(travel && travel.ok),
    seenNote,
    noBlueprintBlocked: !!(noBp && noBp.ok === false),
    fabricated,
    allFabricated: kinds.every((k) => fabricated[k]),
    hypoQty5,
    upgradeCapped: !!(maxAgain && maxAgain.ok === false),
    bladeNote,
    bag110,
    water110,
    hp85,
    costs,
    costsOk,
    unknownBlocked: !!(locked && locked.ok === false),
    persistFab: !!hydrated.unlocked.fabricator,
    persistBp: bpKeys.every((k) => !!(hydrated.blueprints && hydrated.blueprints[k])),
    persistBlade: (hydrated.stores.energy_blade || 0) > 0,
    persistHypo: hydrated.stores.hypo === 5,
    persistLaser: (hydrated.stores.laser_rifle || 0) > 0,
    persistBeacon: (hydrated.stores.fleet_beacon || 0) > 0
  };
}

/** Headless batch-9 executioner wings, ending score, prestige. */
export function endingPlaythrough() {
  const sb = makeSandbox({ seed: 9 });
  const events = loadEvents();
  const g = new sb.ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99 }, events);
  const s = g.state;
  const A = (n, a = {}) => g.act(n, a);
  const ids = ["executioner", "engineering_wing", "martial_wing", "medical_wing", "command_deck"];
  const allEvents = ids.every((id) => !!(events[id] && events[id].scenes && events[id].scenes.start));
  s.unlocked.path = true;
  s.unlocked.world = true;
  Object.assign(s.stores, { cured_meat: 20, torch: 4, bone_spear: 1 });
  A("pack", { item: "cured_meat", amount: 10 });
  A("pack", { item: "torch", amount: 2 });
  A("pack", { item: "bone_spear", amount: 1 });
  A("embark");
  const spawn = (id) => {
    s.active_event = null;
    s.combat = null;
    g.applyCalls([{ tool: "spawn_event", args: { event_id: id } }], "test");
    return !!(s.active_event && s.active_event.id === id);
  };
  const fight = () => {
    let n = 0;
    while (s.combat && n++ < 200) {
      if (s.world.hp <= (s.combat.dmg || 1) + 2 && ((s.outfit.cured_meat || 0) + (s.outfit.meat || 0)) > 0) {
        A("combat", { move: "eat" });
      } else {
        A("combat", { move: (s.outfit.bone_spear || 0) > 0 ? "bone_spear" : "punch" });
      }
    }
  };
  spawn("executioner");
  A("event_choice", { button: "enter" });
  const introEnter = !!(s.active_event && s.active_event.scene === "hull");
  A("event_choice", { button: "continue" });
  const deviceOpen = !!s.flags.executioner_open && !!(s.active_event && s.active_event.scene === "device");
  A("event_choice", { button: "take_device" });
  spawn("executioner");
  const antechamber = !!(s.active_event && s.active_event.scene === "antechamber");
  const cmdHidden = !((s.active_event.spec.scenes.antechamber.buttons || []).some((b) => b.id === "command") && sb.ADR.buttonAvailable(s, (s.active_event.spec.scenes.antechamber.buttons || []).find((b) => b.id === "command")));
  A("event_choice", { button: "leave" });

  const beef = () => { s.world.hp = 200; s.world.max_hp = 200; s.outfit.cured_meat = (s.outfit.cured_meat || 0) + 12; };
  spawn("engineering_wing");
  beef();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.active_event) A("event_choice", { button: "leave" });
  const engFlag = !!s.flags.wing_engineering;

  spawn("martial_wing");
  beef();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.active_event) A("event_choice", { button: "leave" });
  const martialFlag = !!s.flags.wing_martial;

  spawn("medical_wing");
  beef();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.combat) fight();
  A("event_choice", { button: "continue" });
  if (s.active_event) A("event_choice", { button: "leave" });
  const medFlag = !!s.flags.wing_medical;

  spawn("executioner");
  const cmdBtn = (s.active_event.spec.scenes.antechamber.buttons || []).find((b) => b.id === "command");
  const commandOpen = sb.ADR.buttonAvailable(s, cmdBtn);
  A("event_choice", { button: "leave" });

  spawn("command_deck");
  beef();
  A("event_choice", { button: "continue" });
  A("event_choice", { button: "approach" });
  A("event_choice", { button: "observe" });
  if (s.combat) fight();
  if (s.combat) {
    sb.ADR.applySceneEffects(s, events.command_deck.scenes.immortal);
    s.combat = null;
  }
  if (s.active_event) A("event_choice", { button: "continue" });
  if (s.active_event) A("event_choice", { button: "leave" });
  const beacon = (s.outfit.fleet_beacon || 0) + (s.stores.fleet_beacon || 0) > 0;

  const factors = sb.ADR.SCORE_FACTORS;
  const orig = [1, 1.5, 1, 2, 2, 3, 3, 2, 2, 2, 2, 1.5, 1, 1, 10, 30, 50, 100, 150, 150, 3, 3, 5, 4];
  const factorsOk = factors && factors.length === orig.length && factors.every((n, i) => n === orig[i]);
  s.world.on_expedition = false;
  Object.keys(s.stores).forEach((k) => { s.stores[k] = 0; });
  s.stores.wood = 10;
  const base = sb.ADR.calculateScore(s);
  s.stores.alien_alloy = 2;
  const scoreAlloy = sb.ADR.calculateScore(s) === base + 20;
  s.stores.fleet_beacon = 1;
  const scoreBeacon = sb.ADR.calculateScore(s) === base + 20 + 500;
  ensureShip(s, sb);
  s.spaceShip.hull = 3;
  const scoreHull = sb.ADR.calculateScore(s) === base + 20 + 500 + 150;

  s.unlocked.ship = true;
  s.unlocked.space = true;
  s.location = "space";
  s.space = { active: true, done: false, altitude: 61, asteroids: [], hull: 3, shipX: 20, shipY: 20, startedAt: s.game_time_sec - 61, altAcc: 0, spawnAcc: 0 };
  tickGame(sb, g, 1, 0.25);
  const endingOnEscape = !!s.ending && s.location === "ending" && !!s.flags.ending;
  const prestigeSaved = !!(s.previous && typeof s.previous.score === "number" && s.previous.score > 0);
  const woodBefore = s.stores.wood;
  const prevCopy = JSON.parse(JSON.stringify(s.previous));
  const fresh = sb.ADR.migrateState(sb.ADR.createState());
  sb.ADR.prestigeSet(fresh, prevCopy);
  sb.ADR.prestigeCollect(fresh);
  const prestigeCollect = (fresh.stores.wood || 0) > 0 || (prevCopy.stores && prevCopy.stores.every((n) => !n));
  const hydrated = sb.ADR.hydrateState(JSON.parse(JSON.stringify(s)));
  return {
    allEvents,
    introEnter,
    deviceOpen,
    antechamber,
    commandGated: cmdHidden,
    engFlag,
    martialFlag,
    medFlag,
    commandOpen,
    beacon,
    factorsOk,
    scoreAlloy,
    scoreBeacon,
    scoreHull,
    endingOnEscape,
    prestigeSaved,
    prestigeCollect,
    persistPrevious: !!(hydrated.previous && hydrated.previous.score === s.previous.score),
    woodBefore
  };
}

function ensureShip(s, sb) {
  if (!s.spaceShip) s.spaceShip = { hull: sb.ADR.BASE_HULL, thrusters: sb.ADR.BASE_THRUSTERS, seenShip: true, seenWarning: true };
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
  slice_complete: "visit old_house landmark and return home alive"
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
