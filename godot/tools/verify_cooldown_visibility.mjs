#!/usr/bin/env node
/* Playwright: cooldown continues after a hidden/paused tab. Usage:
 *   node verify_cooldown_visibility.mjs <url> [label]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "/tmp/pw/node_modules/playwright");

const url = process.argv[2] || "http://127.0.0.1:4173/?fresh=1";
const label = process.argv[3] || "after";
const hideN = Number(process.argv[4] || 4);
const outDir = "/opt/cursor/artifacts/cooldown-visibility";
fs.mkdirSync(outDir, { recursive: true });

function slackOk(actual, expected, slack) {
  return Math.abs(actual - expected) <= slack;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(1200);

const btn = page.locator('button.adr[data-key="fire"]');
await btn.waitFor({ timeout: 15000 });
const box = await btn.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(280);

const before = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  const el = document.querySelector('button.adr[data-key="fire"]');
  const left = g.cooldownLeft ? g.cooldownLeft("stoke") : (g.state.cooldowns.stoke || 0);
  return {
    remaining: left,
    countdown: (el.querySelector(".cd-sec") || {}).textContent || null,
    ends_at: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke,
    label: el.innerText.trim(),
    disabled: el.disabled
  };
});
await btn.screenshot({ path: path.join(outDir, `${label}_before.png`) });

await page.evaluate(() => {
  window.__adrRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function () { return 0; };
});
const other = await context.newPage();
await other.goto("about:blank");
await other.bringToFront();
await page.waitForTimeout(Math.round(hideN * 1000));
await page.bringToFront();
await page.evaluate(() => {
  if (window.__adrRAF) window.requestAnimationFrame = window.__adrRAF;
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(250);

const after = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  const el = document.querySelector('button.adr[data-key="fire"]');
  const left = g.cooldownLeft ? g.cooldownLeft("stoke") : (g.state.cooldowns.stoke || 0);
  const tel = JSON.parse(localStorage.getItem("adr.telemetry") || "[]");
  return {
    remaining: left,
    countdown: (el.querySelector(".cd-sec") || {}).textContent || null,
    ends_at: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke,
    label: el.innerText.trim(),
    disabled: el.disabled,
    events: tel.filter((e) => e.event_name === "cooldown_set" || e.event_name === "cooldown_visibility")
      .map((e) => ({ name: e.event_name, payload: e.payload }))
  };
});
await btn.screenshot({ path: path.join(outDir, `${label}_after.png`) });

const expected = hideN >= 10 ? 0 : Math.max(0, (before.remaining || 10) - hideN);
const continued = slackOk(after.remaining || 0, expected, 1.2);
const reset = slackOk(after.remaining || 0, 10, 1.0) && hideN >= 2;
const report = {
  url,
  label,
  hideN,
  before,
  after,
  expected,
  continued,
  reset_to_full: reset,
  PASS: continued && !reset && (hideN >= 10 ? after.disabled === false : after.disabled === true)
};

const out = path.join(outDir, `report_${label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.PASS ? 0 : 1);
