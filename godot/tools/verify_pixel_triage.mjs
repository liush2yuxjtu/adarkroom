#!/usr/bin/env node
/* Pixel-triage audit: 1280/1024/390/1920 + cooldown + telemetry POST.
 * Usage: node godot/tools/verify_pixel_triage.mjs <url> <label>
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "/home/ubuntu/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/?style=pixel&fresh=1";
const label = process.argv[3] || "after";
const outDir = "/opt/cursor/artifacts/pixel-triage";
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
  { name: "1920", width: 1920, height: 1080 }
];

const report = { url, label, at: new Date().toISOString(), viewports: [], cooldown: {}, telemetry: {} };
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({ headless: true, executablePath: chrome });

function rect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "zh-CN" });
  const page = await ctx.newPage();
  const posts = [];
  const failed = [];
  page.on("requestfailed", (req) => {
    if (/playtest_events/.test(req.url())) failed.push({ url: req.url(), error: req.failure() && req.failure().errorText });
  });
  page.on("response", (res) => {
    if (/playtest_events/.test(res.url()) && res.request().method() === "POST") {
      posts.push({ url: res.url(), status: res.status() });
    }
  });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => window.__ADR_GAME, { timeout: 20000 });
  await page.waitForTimeout(400);
  const fire = page.locator("#room-btns button[data-key='fire']");
  if (await fire.count()) {
    try { await fire.first().click({ timeout: 4000 }); } catch (e) { /* ignore */ }
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g = window.__ADR_GAME;
    if (!g) return;
    g.state.wood_initialized = true;
    g.state.stores.wood = 8;
    g.emit();
  });
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
    };
    const scene = document.querySelector(".px-scene");
    const host = document.querySelector(".px-scene-host");
    const hearth = document.querySelector(".px-hearth");
    const notes = document.getElementById("notifications");
    const stores = document.getElementById("stores");
    const pile = document.querySelector(".px-woodpile");
    const animal = document.querySelector(".px-animal");
    const flame = document.querySelector(".px-flame");
    const tabs = [...document.querySelectorAll("#header button")].map((b) => ({
      w: b.getBoundingClientRect().width,
      h: b.getBoundingClientRect().height,
      opacity: Number(getComputedStyle(b).opacity),
      disabled: b.disabled
    }));
    const hostR = r(host || scene);
    const storesR = r(stores);
    const overlap = !!(hostR && storesR && storesR.w > 0 && hostR.w > 0 &&
      !(storesR.right <= hostR.x || storesR.x >= hostR.right || storesR.bottom <= hostR.y || storesR.y >= hostR.bottom));
    const vw = window.innerWidth;
    const vis = hostR && hostR.w > 0 ? (Math.min(hostR.right, vw) - Math.max(hostR.x, 0)) / hostR.w : 0;
    return {
      style: document.body.className,
      dataStyle: document.documentElement.getAttribute("data-style"),
      hasGame: !!window.__ADR_GAME,
      scale: scene ? parseFloat(getComputedStyle(scene).getPropertyValue("--px-scale")) || 1 : null,
      scene: r(scene),
      host: hostR,
      hearth: r(hearth),
      notes: r(notes),
      stores: storesR,
      pile: r(pile),
      pileEmpty: pile ? pile.classList.contains("empty") : null,
      animal: r(animal),
      flame: r(flame),
      tabs,
      sceneVisible: vis,
      hearthInView: !!(hearth && r(hearth).x >= -1 && r(hearth).right <= vw + 1),
      storesOverlap: overlap,
      notesX: notes ? notes.getBoundingClientRect().x : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: vw,
      pixelLayout: (window.ADRTelemetry && ADRTelemetry.buffer || []).filter((e) => e.event_name === "pixel_layout").slice(-1)[0] || null
    };
  });
  const shot = path.join(outDir, `${label}_pixel_${vp.name}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  const pass = {
    sceneVisible: metrics.sceneVisible >= 0.95,
    hearthInView: metrics.hearthInView,
    storesOverlap: !metrics.storesOverlap,
    notesInFlow: metrics.notesX != null && metrics.notesX >= -1,
    noHScroll: metrics.scrollWidth <= metrics.innerWidth + 2,
    tabGrid: metrics.tabs.every((t) => t.w === 64 || t.w === 80),
    lockedOpacity: metrics.tabs.filter((t) => t.disabled).every((t) => t.opacity >= 0.55),
    flameBig: !metrics.flame || metrics.flame.w >= 72,
    pileBig: !metrics.pile || metrics.pile.w / (metrics.scale || 1) >= 90,
    animalBig: !metrics.animal || metrics.animal.w / (metrics.scale || 1) >= 90
  };
  report.viewports.push({ vp: vp.name, shot, pass, metrics, posts, failed });
  await ctx.close();
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
const page = await ctx.newPage();
const telPosts = [];
page.on("response", (res) => {
  if (/playtest_events/.test(res.url()) && res.request().method() === "POST") {
    telPosts.push({ url: res.url(), status: res.status() });
  }
});
await page.goto(url.replace("fresh=1", "fresh=1"), { waitUntil: "networkidle", timeout: 60000 });
await page.waitForFunction(() => window.__ADR_GAME, { timeout: 20000 });
const fire = page.locator("#room-btns button[data-key='fire']");
await fire.waitFor({ timeout: 10000 });
const box = await fire.boundingBox();
if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  return { left: g.cooldownLeft ? g.cooldownLeft("stoke") : 0, ends: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke };
});
await page.evaluate(() => {
  window.__adrRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function () { return 0; };
});
const other = await ctx.newPage();
await other.goto("about:blank");
await other.bringToFront();
await page.waitForTimeout(4000);
await page.bringToFront();
await page.evaluate(() => {
  if (window.__adrRAF) window.requestAnimationFrame = window.__adrRAF;
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(300);
const after = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  return { left: g.cooldownLeft ? g.cooldownLeft("stoke") : 0, ends: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke };
});
await page.waitForTimeout(4000);
const session = await page.evaluate(() => window.ADRTelemetry && ADRTelemetry.sessionId);
report.cooldown = { before, after, pass: after.left <= before.left - 2.5 && after.left > 0 };
report.telemetry = { sessionId: session, posts: telPosts, ok: telPosts.some((p) => p.status >= 200 && p.status < 300) };
await page.screenshot({ path: path.join(outDir, `${label}_cooldown_1280.png`) });
await browser.close();

const out = path.join(outDir, `report_${label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const failedVp = report.viewports.filter((v) => Object.values(v.pass).some((x) => x === false));
process.exit(failedVp.length ? 1 : 0);
