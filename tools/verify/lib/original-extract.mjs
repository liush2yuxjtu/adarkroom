/**
 * Auto-extract original A Dark Room content from script/*.js + lang/zh_cn.
 * No hand list of titles/keys: every run re-reads the source of truth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
export const snake = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function loadZhCn() {
  const src = rd("lang/zh_cn/strings.js");
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  const slice = src.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return Function(`"use strict"; return (${slice});`)();
  }
}

function objectKeysAt(src, marker, indent = "\t\t") {
  const i = src.indexOf(marker);
  if (i < 0) return [];
  const j = src.indexOf("\n\t},", i);
  const re = new RegExp(`\\n${indent}'([a-z ]+)': \\{`, "g");
  return [...src.slice(i, j).matchAll(re)].map((m) => m[1]);
}

function craftableBlocks(src) {
  const i = src.indexOf("Craftables:");
  const j = src.indexOf("\n\t},", i);
  const out = {};
  const re = /\n\t\t'([a-z ]+)': \{([\s\S]*?)\n\t\t\}/g;
  for (const m of src.slice(i, j).matchAll(re)) out[m[1]] = m[2];
  return out;
}

function tradeBlocks(src) {
  const i = src.indexOf("TradeGoods:");
  const j = src.indexOf("\n\t},", i);
  const out = {};
  const re = /\n\t\t'([a-z ]+)': \{([\s\S]*?)\n\t\t\}/g;
  for (const m of src.slice(i, j).matchAll(re)) out[m[1]] = m[2];
  return out;
}

export function normalizeCost(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[snake(k)] = n;
  }
  return out;
}

export function costsEqual(a, b) {
  const A = normalizeCost(a);
  const B = normalizeCost(b);
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    if (Number(A[k] || 0) !== Number(B[k] || 0)) return false;
  }
  return keys.size > 0 || (Object.keys(A).length === 0 && Object.keys(B).length === 0);
}

function evalCostBody(body, n) {
  const $SM = { get: () => n };
  try {
    return normalizeCost(Function("$SM", `"use strict"; return (function () { ${body} })();`)($SM));
  } catch {
    return null;
  }
}

function extractCost(block) {
  const fn = block.match(/cost:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n\t\t\t\}/);
  if (fn) {
    return { n0: evalCostBody(fn[1], 0), n1: evalCostBody(fn[1], 1) };
  }
  const arrow = block.match(/cost:\s*\(\)\s*=>\s*\(([\s\S]*?)\)/);
  if (arrow) {
    try {
      const c = normalizeCost(Function(`"use strict"; return (${arrow[1]});`)());
      return { n0: c, n1: c };
    } catch {
      return { n0: null, n1: null };
    }
  }
  return { n0: null, n1: null };
}

function quoted_(block) {
  const out = [];
  for (const m of block.matchAll(/_\(\s*(['"])([\s\S]*?)\1\s*\)/g)) out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  return out;
}

export function extractOriginal() {
  const room = rd("script/room.js");
  const outside = rd("script/outside.js");
  const world = rd("script/world.js");
  const engine = rd("script/engine.js");
  const path_ = rd("script/path.js");
  const ship = rd("script/ship.js");
  const space = rd("script/space.js");
  const prestige = rd("script/prestige.js");
  const scoring = rd("script/scoring.js");
  const fabSrc = rd("script/fabricator.js");
  const zh = loadZhCn();

  const blocks = craftableBlocks(room);
  const crafts = {};
  for (const [name, block] of Object.entries(blocks)) {
    const type = (block.match(/type:\s*'(\w+)'/) || [])[1] || "?";
    const maximum = block.match(/maximum:\s*(\d+)/);
    crafts[name] = {
      name,
      id: snake(name),
      type,
      maximum: maximum ? Number(maximum[1]) : null,
      cost: extractCost(block),
      messages: quoted_(block)
    };
  }

  const trades = {};
  for (const [name, block] of Object.entries(tradeBlocks(room))) {
    trades[name] = { name, id: snake(name), cost: extractCost(block), type: (block.match(/type:\s*'(\w+)'/) || [])[1] || "good" };
  }

  const incomes = {};
  const incSlice = outside.slice(outside.indexOf("_INCOME:"), outside.indexOf("\n\t},", outside.indexOf("_INCOME:")));
  const incRe = /\n\t\t'([a-z ]+)': \{([\s\S]*?)\n\t\t\}/g;
  for (const m of incSlice.matchAll(incRe)) {
    const stores = {};
    const delay = Number((m[2].match(/delay:\s*(\d+)/) || [])[1] || 10);
    const st = m[2].match(/stores:\s*\{([\s\S]*?)\}/);
    if (st) {
      for (const s of st[1].matchAll(/'([a-z ]+)':\s*(-?[\d.]+)/g)) stores[snake(s[1])] = Number(s[2]);
    }
    incomes[m[1]] = { name: m[1], id: snake(m[1]), delay, stores };
  }

  const weapons = {};
  const wSlice = world.slice(world.indexOf("Weapons: {"), world.indexOf("\n  },", world.indexOf("Weapons: {")));
  for (const m of wSlice.matchAll(/\n    '([a-z ]+)': \{([\s\S]*?)\n    \}/g)) {
    const damageRaw = (m[2].match(/damage:\s*('[^']+'|\d+)/) || [])[1];
    const damage = damageRaw && damageRaw.startsWith("'") ? damageRaw.slice(1, -1) : Number(damageRaw);
    const cooldown = Number((m[2].match(/cooldown:\s*(\d+)/) || [])[1]);
    const type = (m[2].match(/type:\s*'(\w+)'/) || [])[1];
    const cost = {};
    const cm = m[2].match(/cost:\s*\{([^}]+)\}/);
    if (cm) for (const s of cm[1].matchAll(/'([a-z ]+)':\s*(\d+)/g)) cost[snake(s[1])] = Number(s[2]);
    weapons[m[1]] = { name: m[1], id: snake(m[1]), type, damage, cooldown, cost };
  }

  const perks = {};
  const pSlice = engine.slice(engine.indexOf("Perks: {"), engine.indexOf("\n    },", engine.indexOf("Perks: {")));
  for (const m of pSlice.matchAll(/\n      '([a-z ]+)': \{([\s\S]*?)\n      \}/g)) {
    perks[m[1]] = { name: m[1], id: snake(m[1]), messages: quoted_(m[2]) };
  }

  const tiles = {};
  const tileBlock = world.slice(world.indexOf("TILE: {"), world.indexOf("}", world.indexOf("TILE: {")));
  for (const m of tileBlock.matchAll(/(\w+):\s*'(.?)'/g)) tiles[m[1]] = m[2];

  const worldNums = {};
  for (const key of ["RADIUS", "STICKINESS", "LIGHT_RADIUS", "BASE_WATER", "MOVES_PER_FOOD", "MOVES_PER_WATER", "DEATH_COOLDOWN", "FIGHT_CHANCE", "BASE_HEALTH", "BASE_HIT_CHANCE", "MEAT_HEAL", "MEDS_HEAL", "HYPO_HEAL", "FIGHT_DELAY"]) {
    const mm = world.match(new RegExp(`${key}:\\s*([\\d.]+)`));
    if (mm) worldNums[key] = Number(mm[1]);
  }

  const shipNums = {};
  for (const key of ["LIFTOFF_COOLDOWN", "ALLOY_PER_HULL", "ALLOY_PER_THRUSTER", "BASE_HULL", "BASE_THRUSTERS"]) {
    const mm = ship.match(new RegExp(`${key}:\\s*(\\d+)`));
    if (mm) shipNums[key] = Number(mm[1]);
  }
  const spaceNums = {};
  for (const key of ["SHIP_SPEED", "BASE_ASTEROID_DELAY", "BASE_ASTEROID_SPEED", "FTB_SPEED"]) {
    const mm = space.match(new RegExp(`${key}:\\s*(\\d+)`));
    if (mm) spaceNums[key] = Number(mm[1]);
  }

  const fab = {};
  const fabSlice = fabSrc.slice(fabSrc.indexOf("Craftables:"), fabSrc.indexOf("\n  },", fabSrc.indexOf("Craftables:")));
  for (const m of fabSlice.matchAll(/\n    '([a-z ]+)': \{([\s\S]*?)\n    \}/g)) {
    fab[m[1]] = { name: m[1], id: snake(m[1]), cost: extractCost(m[2]), type: (m[2].match(/type:\s*'(\w+)'/) || [])[1], messages: quoted_(m[2]) };
  }

  const titles = (f) => [...rd(f).matchAll(/title:\s*_\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  const uniq = (a) => [...new Set(a)];
  const events = {
    room: uniq(titles("script/events/room.js")),
    outside: uniq(titles("script/events/outside.js")),
    global: uniq(titles("script/events/global.js")),
    marketing: uniq(titles("script/events/marketing.js")),
    encounters: uniq(titles("script/events/encounters.js"))
  };
  const setpieces = uniq(titles("script/events/setpieces.js"));
  const executioner = uniq(titles("script/events/executioner.js"));

  const prestigeStores = [...prestige.matchAll(/store:\s*'([^']+)'/g)].map((m) => m[1]);
  const scoreFactors = [...(scoring.match(/factor\s*=\s*\[([\s\S]*?)\]/) || [, ""])[1].matchAll(/[\d.]+/g)].map(Number);

  const notify = [];
  for (const c of Object.values(crafts)) for (const t of c.messages) notify.push({ from: `craft:${c.name}`, text: t });
  for (const p of Object.values(perks)) for (const t of p.messages) notify.push({ from: `perk:${p.name}`, text: t });
  for (const f of Object.values(fab)) for (const t of f.messages) notify.push({ from: `fabricator:${f.name}`, text: t });

  void path_;
  return {
    crafts,
    trades,
    incomes,
    weapons,
    perks,
    tiles,
    worldNums,
    shipNums,
    spaceNums,
    fab,
    events,
    setpieces,
    executioner,
    prestigeStores,
    scoreFactors,
    notify,
    zh
  };
}

/** Remaining-work batches. Batch 1 is village economy (landed). 2–9 are the rest. */
export const BATCH_META = {
  core: { id: "core", title: "Early room / forest slice already in the remake" },
  1: { id: 1, title: "Village economy (buildings, workers, leather, cured meat)" },
  2: { id: 2, title: "Workshop crafts, water, bags, armour, crafted weapons" },
  3: { id: 3, title: "Trading-post buy menu" },
  4: { id: 4, title: "Room / outside / global / marketing events" },
  5: { id: 5, title: "World combat: encounters, weapons, perks, map rules" },
  6: { id: 6, title: "Landmarks and setpieces (including mines)" },
  7: { id: 7, title: "Ship and space" },
  8: { id: 8, title: "Fabricator and blueprints" },
  9: { id: 9, title: "Executioner, ending, prestige, score" }
};

const CORE_BUILDINGS = new Set(["trap", "cart", "hut"]);
const B1_BUILDINGS = new Set(["lodge", "trading post", "tannery", "smokehouse", "workshop", "steelworks", "armoury"]);
const B2_CRAFTS = new Set([
  "torch", "waterskin", "cask", "water tank", "bone spear", "rucksack", "wagon", "convoy",
  "l armour", "i armour", "s armour", "iron sword", "steel sword", "rifle"
]);
const B1_WORKERS = new Set(["hunter", "trapper", "tanner", "charcutier", "iron miner", "coal miner", "sulphur miner", "steelworker", "armourer"]);
const B1_ITEMS = new Set(["leather", "cured meat", "iron", "coal", "steel", "sulphur", "bait", "bullets"]);
const CORE_EVENTS = new Set(["The Nomad", "Noises", "A Ruined Trap", "A Beast Attack", "An Old House", "A Snarling Beast"]);

export function batchOf(category, name) {
  if (category === "building") {
    if (CORE_BUILDINGS.has(name)) return "core";
    if (B1_BUILDINGS.has(name)) return 1;
    return 2;
  }
  if (category === "worker/income") return name === "gatherer" ? "core" : B1_WORKERS.has(name) ? 1 : 2;
  if (category === "tool/weapon/upgrade") {
    if (name === "fists (punch)" || name === "compass") return "core";
    if (B2_CRAFTS.has(name) || name === "laser rifle") return name === "laser rifle" ? 8 : 2;
    return 2;
  }
  if (category === "trade good") return name === "compass" ? "core" : 3;
  if (category === "item/resource") {
    if (B1_ITEMS.has(name)) return 1;
    if (["medicine", "energy cell", "alien alloy"].includes(name)) return 3;
    if (name.endsWith("blueprint") || name === "fleet beacon") return 8;
    return "core";
  }
  if (category.startsWith("event:")) {
    if (CORE_EVENTS.has(name)) return "core";
    if (category === "event:encounters") return 5;
    if (category === "event:marketing") return 4;
    return 4;
  }
  if (category === "landmark/setpiece" || category === "setpiece event") return 6;
  if (category === "fabricator") return 8;
  if (category === "executioner") return 9;
  if (category === "later phase") {
    if (name.startsWith("path")) return "core";
    if (name === "ship" || name === "space") return 7;
    if (name === "fabricator") return 8;
    return 9;
  }
  if (category === "perk" || category === "weapon" || category === "world tile" || category === "world mechanic") return 5;
  if (category === "ship" || category === "space") return 7;
  if (category === "prestige" || category === "score") return 9;
  if (category === "notification") {
    const m = String(name).match(/^(craft|perk|fabricator):([^:]+)/);
    if (m) {
      if (m[1] === "perk") return 5;
      if (m[1] === "fabricator") return 8;
      const craft = m[2].trim();
      if (CORE_BUILDINGS.has(craft) || B1_BUILDINGS.has(craft)) return batchOf("building", craft);
      return batchOf("tool/weapon/upgrade", craft);
    }
    return 4;
  }
  return 9;
}

export const EVENT_ALIASES = {
  "The Nomad": "nomad",
  "Noises": "noises_outside",
  "A Ruined Trap": "ruined_trap",
  "A Beast Attack": "beast_attack",
  "An Old House": "old_house",
  "A Snarling Beast": "snarling_beast",
  "The Beggar": "beggar",
  "The Shady Builder": "shady_builder",
  "The Mysterious Wanderer": "mysterious_wanderer",
  "The Scout": "scout",
  "The Master": "master",
  "The Sick Man": "sick_man",
  "Fire": "fire",
  "Sickness": "sickness",
  "Plague": "plague",
  "A Military Raid": "military_raid",
  "The Thief": "thief",
  "Penrose": "penrose",
  "A Gaunt Man": "gaunt_man",
  "A Strange Bird": "strange_bird",
  "A Two-Headed Creature": "two_headed_creature",
  "A Shivering Man": "shivering_man",
  "A Man-Eater": "man_eater",
  "A Scavenger": "scavenger",
  "A Huge Lizard": "huge_lizard",
  "A Feral Terror": "feral_terror",
  "A Soldier": "soldier",
  "A Sniper": "sniper",
  "An Outpost": "outpost",
  "A Murky Swamp": "swamp",
  "A Damp Cave": "cave",
  "A Deserted Town": "town",
  "A Ruined City": "city",
  "A Forgotten Battlefield": "battlefield",
  "A Huge Borehole": "borehole",
  "A Crashed Ship": "ship",
  "The Sulphur Mine": "sulphurmine",
  "The Coal Mine": "coalmine",
  "The Iron Mine": "ironmine",
  "A Destroyed Village": "cache"
};
export const LANDMARK_IDS = {
  HOUSE: "old_house", CAVE: "cave", TOWN: "town", CITY: "city", OUTPOST: "outpost", SHIP: "ship",
  BOREHOLE: "borehole", BATTLEFIELD: "battlefield", SWAMP: "swamp", CACHE: "cache", EXECUTIONER: "executioner",
  IRON_MINE: "ironmine", COAL_MINE: "coalmine", SULPHUR_MINE: "sulphurmine"
};

export function hasCjk(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ""));
}
