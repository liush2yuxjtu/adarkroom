#!/usr/bin/env node
/* Style toggle: both directions, save identity, 44px target, no console errors.
 * Usage: node godot/tools/verify_style_toggle.mjs <url> [label]
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "/tmp/pw/node_modules/playwright");
import fs from "node:fs";
import path from "node:path";

const url = (process.argv[2] || "http://127.0.0.1:8765/").replace(/\/+$/, "") + "/";
const label = process.argv[3] || "preview";
const outDir = process.env.AUDIT_OUT || "/opt/cursor/artifacts/style-toggle";
fs.mkdirSync(outDir, { recursive: true });
const copyDir = "/workspace/adr-verify";
fs.mkdirSync(copyDir, { recursive: true });

const viewports = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844 }
];

function classifyFailed(failed, posts) {
  const abortedWithSuccess = failed.filter(
    (f) =>
      f.error === "net::ERR_ABORTED" &&
      posts.some((p) => p.status >= 200 && p.status < 300 && p.url === f.url)
  );
  const realFailures = failed.filter(
    (f) => !abortedWithSuccess.some((p) => p.url === f.url && p.error === f.error)
  );
  return { abortedWithSuccess, realFailures };
}

function canonSave(raw) {
  if (!raw) return null;
  let doc;
  try { doc = JSON.parse(raw); } catch (e) { return { parseError: String(e) }; }
  const s = doc.state || {};
  return {
    session_id: s.session_id,
    stores: s.stores || {},
    fire: s.fire,
    unlocked: s.unlocked || {},
    buildings: s.buildings || {},
    notifications: (s.notifications || []).map((n) => n && n.text),
    wood_initialized: s.wood_initialized,
    builder_level: s.builder_level,
    population: s.population,
    flags: s.flags || {},
    location: s.location,
    active_event: s.active_event ? s.active_event.id : null
  };
}

async function realClick(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
  }, selector);
  if (!box) return false;
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}

const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(chrome) ? chrome : undefined
});

const report = { url, label, at: new Date().toISOString(), viewports: [], checks: [], override: null };

async function snapshot(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("adr.save.v1");
    let doc = null;
    try { doc = raw ? JSON.parse(raw) : null; } catch (e) { doc = null; }
    const g = window.__ADR_GAME;
    const storesEl = document.getElementById("stores");
    const visibleStores = {};
    if (storesEl) {
      storesEl.querySelectorAll(".store-row").forEach((row) => {
        const n = row.querySelector(".n");
        const name = (row.querySelector("span") || row).textContent.replace(/\d+\s*$/, "").trim();
        if (n) visibleStores[name] = Number(n.textContent);
        else if (row.getAttribute("aria-label")) visibleStores[row.getAttribute("aria-label")] = row.querySelectorAll(".px-icon").length;
      });
    }
    const btn = document.getElementById("btn-style");
    const br = btn ? btn.getBoundingClientRect() : null;
    const tel = JSON.parse(localStorage.getItem("adr.telemetry") || "[]");
    const toggles = tel.filter((e) => e && e.event_name === "style_toggle");
    return {
      style: document.documentElement.getAttribute("data-style"),
      bodyPixel: document.body.classList.contains("style-pixel"),
      bodyText: document.body.classList.contains("style-text"),
      remembered: localStorage.getItem("adr.style"),
      raw,
      session_id: g && g.state && g.state.session_id,
      stores: g && g.state ? JSON.parse(JSON.stringify(g.state.stores || {})) : {},
      fire: g && g.state ? g.state.fire : null,
      unlocked: g && g.state ? JSON.parse(JSON.stringify(g.state.unlocked || {})) : {},
      buildings: g && g.state ? JSON.parse(JSON.stringify(g.state.buildings || {})) : {},
      notifications: g && g.state ? (g.state.notifications || []).map((n) => n && n.text) : [],
      wood_initialized: g && g.state && g.state.wood_initialized,
      visibleStores,
      href: location.href,
      toggle: btn ? {
        text: (btn.innerText || "").trim(),
        aria: btn.getAttribute("aria-label"),
        pressed: btn.getAttribute("aria-pressed"),
        w: br ? Math.round(br.width) : 0,
        h: br ? Math.round(br.height) : 0,
        x: br ? Math.round(br.x) : -1,
        y: br ? Math.round(br.y) : -1,
        visible: !!(br && br.width > 0 && br.height > 0)
      } : null,
      scene: !!document.querySelector(".px-scene"),
      lastToggle: toggles.length ? toggles[toggles.length - 1].payload : null,
      toggleCount: toggles.length,
      save_id: doc && doc.save_id
    };
  });
}

function sameProgress(a, b) {
  const diffs = [];
  const keys = ["session_id", "stores", "fire", "unlocked", "buildings", "notifications", "wood_initialized", "save_id"];
  keys.forEach((k) => {
    const sa = JSON.stringify(a[k]);
    const sb = JSON.stringify(b[k]);
    if (sa !== sb) diffs.push({ key: k, before: a[k], after: b[k] });
  });
  const ca = canonSave(a.raw);
  const cb = canonSave(b.raw);
  if (JSON.stringify(ca) !== JSON.stringify(cb)) diffs.push({ key: "canon_save", before: ca, after: cb });
  return diffs;
}

for (const vp of viewports) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "zh-CN"
  });
  const page = await ctx.newPage();
  const posts = [];
  const failed = [];
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("requestfailed", (req) => {
    failed.push({
      url: req.url(),
      method: req.method(),
      error: (req.failure() && req.failure().errorText) || ""
    });
  });
  page.on("response", (res) => {
    if (res.request().method() === "POST") posts.push({ url: res.url(), status: res.status() });
    if (res.status() >= 400) failed.push({ url: res.url(), method: res.request().method(), error: String(res.status()) });
  });

  const target = `${url}?fresh=1`;
  await page.goto(target, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__ADR_GAME, { timeout: 20000 });
  await page.waitForTimeout(400);

  const fireSel = "#room-btns button[data-key='fire']";
  const lit = await realClick(page, fireSel);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const g = window.__ADR_GAME;
    if (!g) return;
    g.state.wood_initialized = true;
    g.state.stores.wood = Math.max(g.state.stores.wood || 0, 12);
    g.state.unlocked.outside = true;
    g.emit();
  });
  await page.waitForTimeout(300);

  const outsideTab = 'button[data-tab="outside"]';
  await realClick(page, outsideTab);
  await page.waitForTimeout(300);
  const gatherSel = "#out-btns button[data-key='gather']";
  const gathered = await realClick(page, gatherSel);
  if (!gathered) {
    await page.evaluate(() => {
      const g = window.__ADR_GAME;
      if (g) g.act("gather_wood");
    });
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => {
    const g = window.__ADR_GAME;
    if (!g) return;
    g.timeScale = 0;
    if (g.persistSave) g.persistSave();
  });
  await page.waitForTimeout(150);

  const before = await snapshot(page);
  const shot0 = path.join(outDir, `${label}_${vp.name}_before.png`);
  await page.screenshot({ path: shot0, fullPage: true });
  fs.copyFileSync(shot0, path.join(copyDir, `${label}_${vp.name}_before.png`));

  const clickedTo = await realClick(page, "#btn-style");
  await page.waitForTimeout(400);
  const after1 = await snapshot(page);
  const shot1 = path.join(outDir, `${label}_${vp.name}_after1.png`);
  await page.screenshot({ path: shot1, fullPage: true });
  fs.copyFileSync(shot1, path.join(copyDir, `${label}_${vp.name}_after1.png`));

  const clickedBack = await realClick(page, "#btn-style");
  await page.waitForTimeout(400);
  const after2 = await snapshot(page);
  const shot2 = path.join(outDir, `${label}_${vp.name}_after2.png`);
  await page.screenshot({ path: shot2, fullPage: true });
  fs.copyFileSync(shot2, path.join(copyDir, `${label}_${vp.name}_after2.png`));

  const net = classifyFailed(failed, posts);
  const diffs1 = sameProgress(before, after1);
  const diffs2 = sameProgress(after1, after2);
  const startStyle = before.style;
  const midStyle = after1.style;
  const endStyle = after2.style;
  const switched = startStyle !== midStyle && midStyle !== endStyle && startStyle === endStyle;
  const hashes1 = after1.lastToggle || {};
  const hashes2 = after2.lastToggle || {};
  const hashOk1 = hashes1.save_hash_before && hashes1.save_hash_before === hashes1.save_hash_after;
  const hashOk2 = hashes2.save_hash_before && hashes2.save_hash_before === hashes2.save_hash_after;
  const tapOk = [before, after1, after2].every((s) => s.toggle && s.toggle.visible && s.toggle.w >= 44 && s.toggle.h >= 44);

  const round = {
    vp: vp.name,
    lit,
    gathered,
    startStyle,
    midStyle,
    endStyle,
    switched,
    sessionSame: before.session_id === after1.session_id && after1.session_id === after2.session_id,
    diffs1,
    diffs2,
    hashOk1,
    hashOk2,
    hashes1,
    hashes2,
    tapOk,
    toggle: { before: before.toggle, after1: after1.toggle, after2: after2.toggle },
    stores: { before: before.stores, after1: after1.stores, after2: after2.stores },
    fire: { before: before.fire, after1: after1.fire, after2: after2.fire },
    consoleErrors,
    realFailures: net.realFailures,
    shots: [shot0, shot1, shot2]
  };
  round.PASS =
    switched &&
    round.sessionSame &&
    diffs1.length === 0 &&
    diffs2.length === 0 &&
    hashOk1 &&
    hashOk2 &&
    tapOk &&
    clickedTo &&
    clickedBack &&
    consoleErrors.length === 0 &&
    net.realFailures.length === 0 &&
    before.fire > 0 &&
    (before.stores.wood || 0) > 0;
  report.viewports.push(round);
  report.checks.push({
    vp: vp.name,
    toggle_both_ways: switched ? "PASS" : "FAIL",
    save_unchanged: diffs1.length === 0 && diffs2.length === 0 && round.sessionSame ? "PASS" : "FAIL",
    no_console_errors: consoleErrors.length === 0 ? "PASS" : "FAIL",
    toggle_visible_44px: tapOk ? "PASS" : "FAIL"
  });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("adr.style", "text"); } catch (e) { /* ignore */ }
  });
  await page.goto(`${url}?style=pixel&fresh=1`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__ADR_GAME, { timeout: 20000 });
  const ov = await page.evaluate(() => ({
    style: document.documentElement.getAttribute("data-style"),
    remembered: localStorage.getItem("adr.style"),
    href: location.search
  }));
  report.override = {
    ...ov,
    PASS: ov.style === "pixel" && /style=pixel/.test(ov.href)
  };
  await ctx.close();
}

const out = path.join(outDir, `report_${label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
fs.copyFileSync(out, path.join(copyDir, `style_toggle_${label}.json`));
const allPass = report.viewports.every((r) => r.PASS) && report.override && report.override.PASS;
console.log(JSON.stringify({
  url: report.url,
  label,
  allPass,
  checks: report.checks,
  override: report.override,
  out
}, null, 2));
await browser.close();
process.exit(allPass ? 0 : 1);
