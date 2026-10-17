#!/usr/bin/env node
/**
 * Content parity: original English A Dark Room (repo-root script/*.js) vs the Chinese remake
 * (godot/build/web/engine.js, ui.js, godot/data/events.json).
 *
 * Policy: the remake must keep ALL original content. WHITELIST is intentionally empty.
 * Status per entry: present | no_producer (defined/consumed but nothing produces it) | missing.
 * Exit 1 if any entry is not `present` (and not whitelisted).
 *
 *   node tools/verify/parity.mjs [--md out.md] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptySuite, ok, fail, summarize } from "./lib/report.mjs";
import {
  ROOT,
  rd,
  snake,
  extractOriginal,
  EVENT_ALIASES,
  LANDMARK_IDS
} from "./lib/original-extract.mjs";

/** Entries listed here are accepted gaps. Must stay empty: nothing was cut on purpose. */
export const WHITELIST = [];

// ---------- original extraction ----------
function objectKeysAt(src, marker, indent = "\t\t") {
  const i = src.indexOf(marker);
  if (i < 0) return [];
  const j = src.indexOf("\n\t},", i);
  const re = new RegExp(`\\n${indent}'([a-z ]+)': \\{`, "g");
  return [...src.slice(i, j).matchAll(re)].map((m) => m[1]);
}
function craftableTypes(src) {
  const i = src.indexOf("Craftables:");
  const j = src.indexOf("\n\t},", i);
  const out = {};
  const re = /\n\t\t'([a-z ]+)': \{([\s\S]*?)\n\t\t\}/g;
  for (const m of src.slice(i, j).matchAll(re)) out[m[1]] = (m[2].match(/type: '(\w+)'/) || [])[1] || "?";
  return out;
}

export function originalContent() {
  const room = rd("script/room.js");
  const outside = rd("script/outside.js");
  const world = rd("script/world.js");
  const path_ = rd("script/path.js");
  const types = craftableTypes(room);
  const buildings = Object.keys(types).filter((k) => types[k] === "building");
  const gear = Object.keys(types).filter((k) => types[k] !== "building");
  const misc = objectKeysAt(room, "MiscItems:");
  const weaponsBlock = world.slice(world.indexOf("Weapons: {"), world.indexOf("\n\t},", world.indexOf("Weapons: {")));
  const weapons = [...weaponsBlock.matchAll(/\n\t\t'([a-z ]+)': \{/g)].map((m) => m[1]);
  const workers = objectKeysAt(outside, "_INCOME:");
  const trade = objectKeysAt(room, "TradeGoods:");
  // items: anything that is a store key in incomes, craft/trade costs, or loot tables
  const items = new Set();
  const addKeys = (txt) => { for (const m of txt.matchAll(/'([a-z][a-z ]+)':\s*(?:-?[\d.]+|\{\s*\n?\s*min:)/g)) items.add(m[1]); };
  for (const m of outside.matchAll(/stores: \{([\s\S]*?)\}/g)) addKeys(m[1]);
  for (const m of room.matchAll(/cost: function[\s\S]*?return \{([\s\S]*?)\};/g)) addKeys(m[1]);
  for (const f of fs.readdirSync(path.join(ROOT, "script/events"))) {
    const s = rd("script/events/" + f);
    for (const m of s.matchAll(/loot: \{([\s\S]*?)\n\t*\}/g)) addKeys(m[1]);
    for (const m of s.matchAll(/cost: \{([\s\S]*?)\}/g)) addKeys(m[1]);
    for (const m of s.matchAll(/reward: \{([\s\S]*?)\}/g)) addKeys(m[1]);
  }
  for (const k of [...buildings, ...workers, "torch"]) items.delete(k); // buildings/workers are not store items
  for (const k of [...gear, ...misc, ...weapons, ...trade]) items.delete(k); // listed in their own category
  // events
  const titles = (f) => [...rd(f).matchAll(/title: _\('([^']+)'\)/g)].map((m) => m[1]);
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
  const tileBlock = world.slice(world.indexOf("TILE: {"), world.indexOf("}", world.indexOf("TILE: {")));
  const terrain = new Set(["VILLAGE", "FOREST", "FIELD", "BARRENS", "ROAD"]);
  const landmarks = [...tileBlock.matchAll(/(\w+): '(.)'/g)].map((m) => m[1]).filter((k) => !terrain.has(k));
  const fab = [...rd("script/fabricator.js").matchAll(/\n    '([a-z ]+)': \{/g)].map((m) => m[1]);
  for (const k of fab) items.delete(k);
  items.delete("hp"); items.delete("water"); // expedition stats, not store items (remake has world.hp/world.water)
  const phases = ["path (embark/outfit)", "ship", "space", "fabricator", "ending/prestige/score"];
  void path_;
  return { buildings, gear, misc, weapons, workers, trade, fab, items: [...items].sort(), events, setpieces, executioner, landmarks, phases };
}

// ---------- remake inspection ----------
const ENGINE = "godot/build/web/engine.js";
const UI = "godot/build/web/ui.js";
const EVENTS = "godot/data/events.json";
function lineOf(file, needle) {
  const lines = rd(file).split("\n");
  const i = lines.findIndex((l) => (needle instanceof RegExp ? needle.test(l) : l.includes(needle)));
  return i >= 0 ? `${file}:${i + 1}` : null;
}

export function remakeContent() {
  const eng = rd(ENGINE);
  const ev = JSON.parse(rd(EVENTS));
  const items = JSON.parse(eng.match(/var ITEMS = (\[[^\]]*\])/)[1]);
  const areas = JSON.parse(eng.match(/var AREAS = (\[[^\]]*\])/)[1]);
  const buildingKinds = [...eng.matchAll(/if \(kind === "(\w+)"\) return \{/g)].map((m) => m[1]);
  const workers = Object.keys(JSON.parse(eng.match(/workers: (\{[^}]*\})/)[1].replace(/(\w+):/g, '"$1":')));
  const landmarks = Object.values(JSON.parse(eng.match(/landmarks: (\{[^}]*\})/)[1]));
  // producers: trap drops, event rewards, give_item rule calls, worker incomes
  const produced = new Set(["wood"]);
  for (const m of eng.matchAll(/\{ name: "(\w+)", roll:/g)) produced.add(m[1]);
  for (const m of eng.matchAll(/give_item", args: \{ item: "(\w+)"/g)) produced.add(m[1]);
  const walk = (o) => { if (o && typeof o === "object") { for (const [k, v] of Object.entries(o)) { if (k === "reward" || k === "loot") Object.keys(v).forEach((x) => produced.add(x)); walk(v); } } };
  walk(ev);
  const inc = eng.match(/var INCOME = \{([\s\S]*?)\n  \};/);
  if (inc) {
    for (const m of inc[1].matchAll(/(\w+):\s*(-?[\d.]+)/g)) {
      if (Number(m[2]) > 0) produced.add(m[1]);
    }
  }
  const craftTbl = eng.match(/var CRAFTABLE = \{([\s\S]*?)\n  \};/);
  if (craftTbl) {
    for (const m of craftTbl[1].matchAll(/^\s+(\w+):/gm)) produced.add(m[1]);
  }
  const fabTbl = eng.match(/var FABRICABLE = \{([\s\S]*?)\n  \};/);
  if (fabTbl) {
    for (const m of fabTbl[1].matchAll(/^\s+(\w+):/gm)) produced.add(m[1]);
  }
  const buyable = new Set();
  for (const e of Object.values(ev)) for (const b of e.buttons || []) if (b.cost && b.reward) Object.keys(b.reward).forEach((x) => buyable.add(x));
  const tradeTbl = eng.match(/var TRADEABLE = \{([\s\S]*?)\n  \};/);
  if (tradeTbl) {
    for (const m of tradeTbl[1].matchAll(/^\s+(\w+):/gm)) {
      buyable.add(m[1]);
      produced.add(m[1]);
    }
  }
  return { items, areas, buildingKinds, workers, landmarks, produced, buyable, events: ev };
}

export { EVENT_ALIASES, LANDMARK_IDS, extractOriginal };

export function runParity() {
  const o = originalContent();
  const r = remakeContent();
  const suite = emptySuite("parity");
  const rows = [];
  const add = (category, name, status, where, note = "") => {
    const id = `${category}:${name}`;
    const white = WHITELIST.includes(id);
    rows.push({ category, name, status, where, note });
    const rec = { id, status, where, note };
    if (status === "present" || white) ok(suite, rec); else fail(suite, rec);
  };
  const itemStatus = (k) => {
    const id = snake(k);
    if (!r.items.includes(id)) return ["missing", null];
    const where = lineOf(ENGINE, `${id}:`) || lineOf(ENGINE, `"${id}"`);
    return r.produced.has(id) ? ["present", where] : ["no_producer", where, "in ITEMS, nothing yields it"];
  };

  for (const b of o.buildings) {
    const id = snake(b);
    add("building", b, r.buildingKinds.includes(id) ? "present" : "missing", lineOf(ENGINE, `kind === "${id}") return`));
  }
  for (const g of [...o.gear, ...o.misc]) { const [s, w, n] = itemStatus(g); add("tool/weapon/upgrade", g, s, w, n); }
  for (const g of o.weapons.filter((x) => !o.gear.includes(x) && !o.misc.includes(x))) {
    // fists / combat moves: the remake has a `punch` move
    if (g === "fists") { add("tool/weapon/upgrade", "fists (punch)", /move === "punch"/.test(rd(ENGINE)) ? "present" : "missing", lineOf(ENGINE, 'move === "punch"')); continue; }
    const [s, w, n] = itemStatus(g); add("tool/weapon/upgrade", g, s, w, n);
  }
  for (const k of o.workers) {
    const id = snake(k);
    add("worker/income", k, r.workers.includes(id) ? "present" : "missing", lineOf(ENGINE, `workers: { ${id}`) || lineOf(ENGINE, `${id}:`));
  }
  for (const k of o.trade) {
    const id = snake(k);
    const st = r.buyable.has(id) ? "present" : r.items.includes(id) ? "no_producer" : "missing";
    add("trade good", k, st, r.buyable.has(id) ? (lineOf(ENGINE, `${id}:`) || lineOf(EVENTS, `"buy_${id}"`)) : null, st === "no_producer" ? "item exists but not tradeable" : "");
  }
  for (const k of o.items) { const [s, w, n] = itemStatus(k); add("item/resource", k, s, w, n); }
  for (const [grp, list] of Object.entries(o.events)) {
    for (const t of list) {
      const id = EVENT_ALIASES[t] || snake(t.replace(/^(the|an?) /i, ""));
      add(`event:${grp}`, t, r.events[id] ? "present" : "missing", r.events[id] ? lineOf(EVENTS, `"${id}": {`) : null);
    }
  }
  for (const k of o.landmarks) {
    const id = LANDMARK_IDS[k] || snake(k);
    const placed = r.landmarks.includes(id);
    const st = placed && r.events[id] ? "present" : r.events[id] ? "no_producer" : "missing";
    add("landmark/setpiece", k, st, placed ? lineOf(ENGINE, "landmarks:") : null);
  }
  for (const t of o.setpieces) {
    const id = EVENT_ALIASES[t] || snake(t.replace(/^(the|an?) /i, ""));
    if (["old_house"].includes(id)) continue; // counted as landmark HOUSE
    add("setpiece event", t, r.events[id] ? "present" : "missing", r.events[id] ? lineOf(EVENTS, `"${id}": {`) : null);
  }
  for (const k of o.fab) { const [s, w, n] = itemStatus(k); add("fabricator", k, s, w, n); }
  for (const t of o.executioner) {
    const id = EVENT_ALIASES[t] || snake(t.replace(/^(the|an?) /i, ""));
    add("executioner", t, r.events[id] ? "present" : "missing", r.events[id] ? lineOf(EVENTS, `"${id}": {`) : null);
  }
  const phaseChecks = {
    "path (embark/outfit)": r.areas.includes("path"),
    ship: r.areas.includes("ship"),
    space: r.areas.includes("space"),
    fabricator: r.areas.includes("fabricator"),
    "ending/prestige/score": /prestige|score|ending/.test(rd(ENGINE))
  };
  for (const [k, v] of Object.entries(phaseChecks)) add("later phase", k, v ? "present" : "missing", v ? lineOf(ENGINE, "var AREAS") : null);

  const spec = extractOriginal();
  for (const name of Object.keys(spec.perks)) {
    add("perk", name, /perks/.test(rd(ENGINE)) && new RegExp(`["']${snake(name)}["']`).test(rd(ENGINE)) ? "present" : "missing", lineOf(ENGINE, snake(name)));
  }
  for (const [name, w] of Object.entries(spec.weapons)) {
    if (name === "fists") continue;
    const id = w.id;
    const has = new RegExp(`["']${id}["']|${id}:`).test(rd(ENGINE));
    add("weapon", name, has ? (r.items.includes(id) || r.produced.has(id) ? "present" : "no_producer") : "missing", has ? lineOf(ENGINE, id) : null);
  }
  const TERRAIN = new Set(["VILLAGE", "FOREST", "FIELD", "BARRENS", "ROAD"]);
  for (const tile of Object.keys(spec.tiles)) {
    if (!TERRAIN.has(tile)) continue;
    const mapped = /village|forest|grass|dust|field|barrens|road/.test(rd(ENGINE));
    add("world tile", tile, mapped ? "present" : "missing", lineOf(ENGINE, "function terrainAt"));
  }
  for (const key of Object.keys(spec.worldNums)) {
    add("world mechanic", key, new RegExp(key).test(rd(ENGINE)) ? "present" : "missing", lineOf(ENGINE, key));
  }
  for (const key of Object.keys(spec.shipNums)) add("ship", key, /spaceShip|hull|thruster/.test(rd(ENGINE)) && new RegExp(key).test(rd(ENGINE)) ? "present" : "missing", null);
  for (const key of Object.keys(spec.spaceNums)) add("space", key, new RegExp(key).test(rd(ENGINE)) ? "present" : "missing", null);
  add("prestige", "storesMap + previous.stores", /prestige/.test(rd(ENGINE)) ? "present" : "missing", null);
  add("score", "calculateScore + factors", /totalScore|calculateScore/.test(rd(ENGINE)) ? "present" : "missing", null);
  for (const n of spec.notify) {
    const inRemake = rd(ENGINE).includes(n.text) || rd(UI).includes(n.text);
    add("notification", `${n.from}: ${n.text.slice(0, 48)}`, inRemake ? "present" : "missing", inRemake ? lineOf(ENGINE, n.text.slice(0, 24)) : null);
  }

  // additions in the remake that the original does not have
  const origAll = new Set([...o.fab, ...o.buildings, ...o.gear, ...o.misc, ...o.weapons, ...o.trade, ...o.items].map(snake));
  const additions = [];
  for (const i of r.items) if (!origAll.has(i)) additions.push({ what: `item ${i}`, where: lineOf(ENGINE, "var ITEMS") });
  for (const [id, e] of Object.entries(r.events)) {
    const known = Object.values(EVENT_ALIASES).includes(id);
    if (!known) additions.push({ what: `event ${id} (${e.title})`, where: lineOf(EVENTS, `"${id}": {`) });
  }
  additions.push({ what: "director tool layer (narrate/spawn_event/give_item/unlock_area/set_flag/change_npc_mood) + rule/LLM directors", where: lineOf(ENGINE, "var TOOL_NAMES") });
  additions.push({ what: "phase slice_complete (old house round trip ends the run)", where: lineOf(ENGINE, '"slice_complete"') });
  additions.push({ what: "playtest telemetry (Supabase sink), save checksum/backup", where: "godot/build/web/telemetry.js" });
  return { suite, rows, additions };
}

function toMarkdown({ rows, additions }) {
  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  let md = `# Content parity: original A Dark Room vs Chinese remake\n\nGenerated by \`node tools/verify/parity.mjs --md\`. Whitelist: empty (all original content is required).\n\n`;
  md += `**Totals:** ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")} (of ${rows.length})\n\n`;
  const cats = [...new Set(rows.map((r) => r.category))];
  for (const c of cats) {
    const rs = rows.filter((r) => r.category === c);
    md += `## ${c}\n\n| original | remake status | remake location | note |\n|---|---|---|---|\n`;
    for (const r of rs) md += `| ${r.name} | ${r.status} | ${r.where || "—"} | ${r.note || ""} |\n`;
    md += "\n";
  }
  md += `## Remake additions (not in original)\n\n` + additions.map((a) => `- ${a.what} — ${a.where || ""}`).join("\n") + "\n";
  return md;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = runParity();
  const mi = process.argv.indexOf("--md");
  if (mi > 0) fs.writeFileSync(process.argv[mi + 1], toMarkdown(res));
  const summary = summarize([res.suite]);
  const counts = res.rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log(JSON.stringify({ summary: { ...summary, failures: undefined }, counts, gaps: res.rows.filter((r) => r.status !== "present").map((r) => `${r.category}: ${r.name} [${r.status}]`) }, null, 2));
  process.exit(summary.exitCode);
}
export { toMarkdown };
