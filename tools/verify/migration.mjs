/**
 * Migration review engine: original A Dark Room → Chinese remake.
 *
 * PASS (exit 0) only when every original entry is present, produced/reachable,
 * and numerically faithful, AND each batch's reachability/story run passes.
 * Allowlisted deviations need an explicit reason; the list starts empty.
 *
 *   node tools/verify/migration.mjs
 *   node tools/verify/run.mjs --only migration
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptySuite, ok, fail, summarize, writeJson } from "./lib/report.mjs";
import { makeSandbox } from "./lib/engine-sandbox.mjs";
import { playthrough, workshopPlaythrough } from "./story.mjs";
import { runParity } from "./parity.mjs";
import {
  ROOT,
  rd,
  snake,
  extractOriginal,
  costsEqual,
  batchOf,
  BATCH_META,
  hasCjk,
  EVENT_ALIASES
} from "./lib/original-extract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALLOW_PATH = path.join(HERE, "migration-allowlist.json");
const REPORT_DIR = path.join(HERE, "reports");

export function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOW_PATH, "utf8"));
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  for (const e of entries) {
    if (!e || !e.id || !e.reason) throw new Error(`allowlist entry missing id/reason: ${JSON.stringify(e)}`);
  }
  return raw;
}

function remakeChineseMap(ADR) {
  const map = {};
  const add = (k, v) => {
    if (k && v) map[snake(k)] = v;
  };
  if (ADR.ITEM_CN) Object.entries(ADR.ITEM_CN).forEach(([k, v]) => add(k, v));
  if (ADR.BUILDING_CN) Object.entries(ADR.BUILDING_CN).forEach(([k, v]) => add(k, v));
  if (ADR.WORKER_CN) Object.entries(ADR.WORKER_CN).forEach(([k, v]) => add(k, v));
  if (ADR.STRINGS) Object.entries(ADR.STRINGS).forEach(([k, v]) => add(k, v));
  return map;
}

function persistKeys(ADR) {
  const s = ADR.migrateState(ADR.createState());
  return {
    stores: new Set(Object.keys(s.stores || {})),
    buildings: new Set(Object.keys(s.buildings || {})),
    workers: new Set(Object.keys(s.workers || {})),
    perks: new Set(Object.keys(s.perks || s.character?.perks || {})),
    ship: !!(s.spaceShip || s.ship),
    prestige: !!(s.previous || s.prestige)
  };
}

function numericForRow(row, spec, ADR) {
  const name = row.name;
  if (row.category === "building" && spec.crafts[name]) {
    const orig = spec.crafts[name].cost.n0;
    const rem = ADR.buildingCost ? ADR.buildingCost(snake(name), 0) : null;
    if (!orig) return { status: "skip", detail: "no original cost" };
    if (!rem) return { status: "mismatch", detail: `original ${JSON.stringify(orig)} remake=null` };
    return costsEqual(orig, rem)
      ? { status: "match", detail: JSON.stringify(orig) }
      : { status: "mismatch", detail: `original ${JSON.stringify(orig)} remake ${JSON.stringify(rem)}` };
  }
  if (row.category === "worker/income" && spec.incomes[name]) {
    const orig = spec.incomes[name];
    const rem = ADR.INCOME && ADR.INCOME[orig.id];
    if (!rem) return { status: "mismatch", detail: "no remake INCOME" };
    const delayOk = rem.delay === orig.delay;
    const storesOk = costsEqual(orig.stores, rem.stores);
    return delayOk && storesOk
      ? { status: "match", detail: `delay ${orig.delay} ${JSON.stringify(orig.stores)}` }
      : { status: "mismatch", detail: `orig delay=${orig.delay} ${JSON.stringify(orig.stores)} rem delay=${rem.delay} ${JSON.stringify(rem.stores)}` };
  }
  if ((row.category === "tool/weapon/upgrade" || row.category === "weapon") && spec.crafts[name] && spec.crafts[name].cost.n0) {
    if (row.status === "missing") return { status: "skip", detail: "not present" };
    const orig = spec.crafts[name].cost.n0;
    const rem = ADR.craftCost ? ADR.craftCost(snake(name)) : null;
    if (!rem) return { status: "mismatch", detail: `original ${JSON.stringify(orig)} remake=null` };
    return costsEqual(orig, rem)
      ? { status: "match", detail: JSON.stringify(orig) }
      : { status: "mismatch", detail: `original ${JSON.stringify(orig)} remake ${JSON.stringify(rem)}` };
  }
  if (row.category === "trade good" && spec.trades[name]) {
    if (row.status !== "present") return { status: "skip", detail: row.status };
    return { status: "match", detail: "buyable" };
  }
  if (row.category === "weapon" && spec.weapons[name]) {
    if (row.status === "missing") return { status: "skip", detail: "not present" };
    const w = spec.weapons[name];
    return { status: "mismatch", detail: `damage=${w.damage} cooldown=${w.cooldown} not in remake combat table` };
  }
  if (row.category === "world mechanic") {
    const orig = spec.worldNums[name];
    if (name === "BASE_WATER" && ADR.createState().world.water === orig) return { status: "match", detail: String(orig) };
    if (name === "BASE_HEALTH" && ADR.createState().world.hp === orig) return { status: "match", detail: String(orig) };
    if (name === "RADIUS") {
      const size = ADR.createState().world.size;
      return size === orig * 2 + 1 || size === orig
        ? { status: "match", detail: `size=${size}` }
        : { status: "mismatch", detail: `original RADIUS=${orig} remake world.size=${size}` };
    }
    return { status: row.status === "present" ? "match" : "skip", detail: String(orig) };
  }
  if (row.status === "missing" || row.status === "no_producer") return { status: "skip", detail: row.status };
  return { status: "match", detail: "n/a" };
}

function chineseForRow(row, spec, zhMap, ADR) {
  if (row.status === "missing") return { status: "skip", detail: "not present" };
  const name = row.name;
  const id = snake(name.replace(/ \(punch\)$/, ""));
  const remakeLabel = zhMap[id] || (ADR.STRINGS && ADR.STRINGS[name]);
  const origZh = spec.zh[name] || spec.zh[name.replace(/ \(punch\)$/, "")];
  if (row.category === "notification") {
    const prefix = name.replace(/^(craft|perk|fabricator):[^:]+:\s*/, "");
    const hit = spec.notify.find((n) => n.text.startsWith(prefix) || prefix.startsWith(n.text.slice(0, 40)));
    const text = (hit && hit.text) || prefix;
    const inStrings = ADR.STRINGS && ADR.STRINGS[text];
    const zh = spec.zh[text];
    if (inStrings && hasCjk(inStrings)) return { status: "ok", detail: inStrings };
    if (zh && hasCjk(zh) && row.status === "present") return { status: "ok", detail: zh };
    return { status: "no_zh", detail: "no remake Chinese for notify string" };
  }
  if (row.category.startsWith("event:")) {
    const alias = EVENT_ALIASES[name] || snake(name.replace(/^(the|an?) /i, ""));
    return { status: "skip", detail: `event ${alias}` };
  }
  if (hasCjk(remakeLabel)) return { status: "ok", detail: remakeLabel };
  if (origZh && hasCjk(origZh) && row.status === "present") {
    return { status: "no_zh", detail: `zh_cn has "${origZh}" but remake UI label missing` };
  }
  if (["later phase", "world mechanic", "ship", "space", "prestige", "score", "world tile", "landmark/setpiece", "setpiece event"].includes(row.category)) {
    return { status: "skip", detail: "not a player-facing name" };
  }
  return row.status === "present" ? { status: "no_zh", detail: "no Chinese label" } : { status: "skip", detail: row.status };
}

function persistForRow(row, persist) {
  if (row.status === "missing") return { status: "skip", detail: "not present" };
  const id = snake(row.name.replace(/ \(punch\)$/, "").replace(/ /g, "_"));
  if (row.category === "building") return { status: persist.buildings.has(id) ? "ok" : "no_save", detail: id };
  if (row.category === "worker/income") return { status: persist.workers.has(id) ? "ok" : "no_save", detail: id };
  if (row.category === "item/resource" || row.category === "trade good" || row.category === "tool/weapon/upgrade") {
    if (row.name === "fists (punch)") return { status: "ok", detail: "combat move" };
    return { status: persist.stores.has(id) ? "ok" : "no_save", detail: id };
  }
  if (row.category === "perk") return { status: persist.perks.size ? "ok" : "no_save", detail: "character.perks" };
  if (row.category === "ship") return { status: persist.ship ? "ok" : "no_save", detail: "spaceShip" };
  if (row.category === "prestige" || row.category === "score") return { status: persist.prestige ? "ok" : "no_save", detail: "previous/score" };
  return { status: "ok", detail: "definition" };
}

function reachabilityBatches(parityRows) {
  const by = {};
  for (const r of parityRows) {
    const b = batchOf(r.category, r.name);
    if (!by[b]) by[b] = [];
    by[b].push(r);
  }
  const out = [];
  for (const [id, meta] of Object.entries(BATCH_META)) {
    const rows = by[id] || by[Number(id)] || [];
    const gaps = rows.filter((r) => r.status !== "present");
    if (String(id) === "1" || id === 1) {
      const play = playthrough({ seed: 1001, maxGameSec: 9000 });
      const v = play.village || {};
      const okv = !!(v.lodge && v.smokehouse && v.charcutier && v.cured_meat > 0 && v.packed > 0);
      out.push({
        batch: 1,
        title: meta.title,
        pass: okv && gaps.length === 0,
        kind: "story",
        detail: okv
          ? `lodge/smokehouse/charcutier/cured_meat packed (cured=${v.cured_meat})`
          : JSON.stringify(v)
      });
      continue;
    }
    if (String(id) === "2" || id === 2) {
      const play = workshopPlaythrough();
      const okc = !!(play.allCrafted && play.noWorkshopBlocked && play.waterskinCapped && play.water === 60 && play.bag === 70 && play.hp === 45 && play.hasTorchNote && play.hasRifleNote);
      out.push({
        batch: 2,
        title: meta.title,
        pass: okc && gaps.length === 0,
        kind: "story",
        detail: okc
          ? "workshop crafts + water/bag/armour + buildMsg"
          : JSON.stringify(play)
      });
      continue;
    }
    if (id === "core") {
      out.push({
        batch: "core",
        title: meta.title,
        pass: gaps.length === 0,
        kind: "inventory",
        detail: gaps.length ? `${gaps.length} core gaps` : "early slice present"
      });
      continue;
    }
    out.push({
      batch: Number(id),
      title: meta.title,
      pass: false,
      kind: "story",
      detail: gaps.length
        ? `batch incomplete: ${gaps.length} of ${rows.length} not present`
        : "inventory complete; story runner not yet written for this batch"
    });
  }
  return out;
}

export function runMigration({ writeReport = true } = {}) {
  const suite = emptySuite("migration");
  const allow = loadAllowlist();
  const allowed = new Set((allow.entries || []).map((e) => e.id));
  const spec = extractOriginal();
  const parity = runParity();
  const sb = makeSandbox({ seed: 1 });
  const ADR = sb.ADR;
  const zhMap = remakeChineseMap(ADR);
  const persist = persistKeys(ADR);

  const rows = parity.rows.map((r) => {
    const id = `${r.category}:${r.name}`;
    const num = numericForRow(r, spec, ADR);
    const zh = chineseForRow(r, spec, zhMap, ADR);
    const save = persistForRow(r, persist);
    const batch = batchOf(r.category, r.name);
    return { ...r, id, batch, numeric: num, chinese: zh, persist: save, allowlisted: allowed.has(id) };
  });

  const counts = { present: 0, missing: 0, no_producer: 0, mismatch: 0, no_zh: 0, no_save: 0 };
  const byCat = {};
  const byBatch = {};
  for (const r of rows) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (r.numeric.status === "mismatch") counts.mismatch += 1;
    if (r.chinese.status === "no_zh") counts.no_zh += 1;
    if (r.persist.status === "no_save") counts.no_save += 1;
    byCat[r.category] = byCat[r.category] || { present: 0, missing: 0, no_producer: 0, mismatch: 0, total: 0 };
    byCat[r.category][r.status] = (byCat[r.category][r.status] || 0) + 1;
    byCat[r.category].total += 1;
    if (r.numeric.status === "mismatch") byCat[r.category].mismatch += 1;
    const b = r.batch;
    byBatch[b] = byBatch[b] || { present: 0, missing: 0, no_producer: 0, mismatch: 0, total: 0 };
    byBatch[b][r.status] = (byBatch[b][r.status] || 0) + 1;
    byBatch[b].total += 1;
    if (r.numeric.status === "mismatch") byBatch[b].mismatch += 1;

    const rec = { id: r.id, status: r.status, batch: r.batch, numeric: r.numeric.status, chinese: r.chinese.status, persist: r.persist.status };
    if (r.allowlisted) {
      ok(suite, { ...rec, detail: "allowlisted" });
      continue;
    }
    if (r.status === "present" && r.numeric.status !== "mismatch" && r.chinese.status !== "no_zh" && r.persist.status !== "no_save") {
      ok(suite, rec);
    } else {
      fail(suite, { ...rec, detail: r.note || r.numeric.detail || r.chinese.detail || r.persist.detail || r.status });
    }
  }

  const reach = reachabilityBatches(parity.rows);
  for (const b of reach) {
    const rec = { id: `batch${b.batch}:reachability`, batch: b.batch, kind: b.kind, detail: b.detail };
    if (b.pass) ok(suite, rec);
    else fail(suite, rec);
  }

  const gate = {
    missing: counts.missing,
    no_producer: counts.no_producer,
    numeric_mismatch: counts.mismatch,
    allowlist: allow.entries.length
  };
  const reviewPass = gate.missing === 0 && gate.no_producer === 0 && gate.numeric_mismatch === 0 && reach.every((b) => b.pass);
  if (!reviewPass && suite.pass) {
    fail(suite, { id: "review-gate", detail: JSON.stringify(gate) });
  }

  const report = {
    pass: reviewPass && suite.pass,
    gate,
    counts,
    byCategory: byCat,
    byBatch,
    reachability: reach,
    allowlist: allow,
    additions: parity.additions,
    rows,
    policy: allow.policy
  };

  if (writeReport) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    writeJson(path.join(REPORT_DIR, "migration-baseline.json"), {
      pass: report.pass,
      gate,
      counts,
      byCategory: byCat,
      byBatch,
      reachability: reach,
      gaps: rows.filter((r) => r.status !== "present" || r.numeric.status === "mismatch").map((r) => ({
        id: r.id, status: r.status, batch: r.batch, numeric: r.numeric.status, note: r.note || r.numeric.detail
      }))
    });
    fs.writeFileSync(path.join(REPORT_DIR, "migration-baseline.md"), toMarkdown(report));
  }

  return { suite, report };
}

function toMarkdown(report) {
  const { counts, byCategory, byBatch, reachability, gate, allowlist } = report;
  let md = `# Migration review baseline\n\n`;
  md += `Generated by \`node tools/verify/migration.mjs\`. Source of truth: original \`script/*.js\` + \`lang/zh_cn\`.\n\n`;
  md += `**REVIEW ${report.pass ? "PASS" : "FAIL"}** — exit 0 only when missing=0, no_producer=0, numeric mismatch=0, and every batch reachability run passes.\n\n`;
  md += `## Gate\n\n`;
  md += `| missing | no_producer | numeric mismatch | allowlist |\n|---|---|---|---|\n`;
  md += `| ${gate.missing} | ${gate.no_producer} | ${gate.numeric_mismatch} | ${gate.allowlist} |\n\n`;
  md += `## Counts\n\n`;
  md += `| present | missing | no_producer | numeric mismatch | no Chinese | no save |\n|---|---|---|---|---|---|\n`;
  md += `| ${counts.present || 0} | ${counts.missing || 0} | ${counts.no_producer || 0} | ${counts.mismatch || 0} | ${counts.no_zh || 0} | ${counts.no_save || 0} |\n\n`;
  md += `Policy: ${allowlist.policy}\n\n`;
  md += `## By category\n\n| category | total | present | missing | no_producer | numeric mismatch |\n|---|---|---|---|---|---|\n`;
  for (const [c, n] of Object.entries(byCategory)) {
    md += `| ${c} | ${n.total} | ${n.present || 0} | ${n.missing || 0} | ${n.no_producer || 0} | ${n.mismatch || 0} |\n`;
  }
  md += `\n## By batch\n\n| batch | title | total | present | missing | no_producer | numeric mismatch |\n|---|---|---|---|---|---|---|\n`;
  for (const [b, n] of Object.entries(byBatch)) {
    const title = (BATCH_META[b] || BATCH_META[Number(b)] || {}).title || "";
    md += `| ${b} | ${title} | ${n.total} | ${n.present || 0} | ${n.missing || 0} | ${n.no_producer || 0} | ${n.mismatch || 0} |\n`;
  }
  md += `\n## Reachability / story per batch\n\n| batch | kind | pass | detail |\n|---|---|---|---|\n`;
  for (const b of reachability) {
    md += `| ${b.batch} | ${b.kind} | ${b.pass ? "PASS" : "FAIL"} | ${b.detail} |\n`;
  }
  md += `\n## Remaining gaps (batches 2–9)\n\n`;
  for (const id of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const gaps = report.rows.filter((r) => Number(r.batch) === id && (r.status !== "present" || r.numeric.status === "mismatch"));
    const meta = BATCH_META[id];
    md += `### Batch ${id} — ${meta.title}\n\n`;
    if (!gaps.length) {
      md += `_No inventory gaps._\n\n`;
      continue;
    }
    md += `| original | status | numeric |\n|---|---|---|\n`;
    for (const g of gaps) md += `| ${g.id} | ${g.status} | ${g.numeric.status} |\n`;
    md += `\n`;
  }
  md += `## Allowlist\n\n`;
  if (!allowlist.entries.length) md += `_Empty. Nothing is an intentional cut. Early slow pacing is intentional and must not change._\n`;
  else {
    md += `| id | reason |\n|---|---|\n`;
    for (const e of allowlist.entries) md += `| ${e.id} | ${e.reason} |\n`;
  }
  return md;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { suite, report } = runMigration({ writeReport: true });
  const summary = summarize([suite]);
  console.log(JSON.stringify({
    summary: { ...summary, failures: undefined },
    gate: report.gate,
    counts: report.counts,
    byCategory: report.byCategory,
    byBatch: report.byBatch,
    reachability: report.reachability
  }, null, 2));
  process.exit(summary.exitCode);
}

export { toMarkdown };
