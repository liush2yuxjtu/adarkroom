#!/usr/bin/env node
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.SMOKE_URL || "http://127.0.0.1:4173/";
const out = process.env.SMOKE_SHOT || "/opt/cursor/artifacts/remake_firelit_room.png";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForFunction(() => window.__ADR_GAME, { timeout: 10000 });

const before = await page.evaluate(() => {
  const title = document.querySelector("h1.title")?.textContent || "";
  const notes = [...document.querySelectorAll("#notifications .note")].map((n) => n.textContent);
  const btn = [...document.querySelectorAll("button.adr")].map((b) => b.textContent);
  return { title, notes, btn, htmlLang: document.documentElement.lang };
});
console.log("BEFORE", JSON.stringify(before, null, 2));

const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button.adr")].find((el) => el.textContent.includes("生火"));
  if (!b) return false;
  b.click();
  return true;
});
if (!clicked) {
  console.error("FAIL: 生火 button missing");
  process.exit(1);
}
await page.waitForFunction(() => {
  const t = document.querySelector("h1.title")?.textContent || "";
  const g = window.__ADR_GAME;
  return (t.includes("生火") || t.includes("火")) && g && g.state.fire >= 3;
}, { timeout: 5000 });
await new Promise((r) => setTimeout(r, 400));

const after = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  const title = document.querySelector("h1.title")?.textContent || "";
  const notes = [...document.querySelectorAll("#notifications .note")].map((n) => n.textContent);
  const bodyText = document.body.innerText;
  let telemetry = [];
  try { telemetry = JSON.parse(localStorage.getItem("adr.telemetry") || "[]"); } catch (e) { /* ignore */ }
  return {
    title,
    notes,
    fire: g.state.fire,
    phase: g.state.phase,
    chineseVisible: /小黑屋|生火|添柴|醒来/.test(bodyText),
    fontFamily: getComputedStyle(document.body).fontFamily,
    fonts: [...document.fonts].map((f) => f.family + ":" + f.status),
    telemetryNames: telemetry.map((e) => e.event_name),
    telemetryCount: telemetry.length
  };
});
console.log("AFTER", JSON.stringify(after, null, 2));

fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
console.log("SHOT", out);

if (!before.btn.some((b) => b.includes("生火"))) {
  console.error("FAIL: no 生火 on first paint");
  process.exit(1);
}
if (!after.chineseVisible) {
  console.error("FAIL: Chinese text not visible");
  process.exit(1);
}
if (after.fire < 3) {
  console.error("FAIL: fire did not light");
  process.exit(1);
}
if (!after.telemetryNames.includes("session_start") || !after.telemetryNames.includes("player_action")) {
  console.error("FAIL: telemetry missing", after.telemetryNames);
  process.exit(1);
}

const classic = await page.goto(new URL("/classic/?lang=zh_cn", url).href, { waitUntil: "domcontentloaded", timeout: 20000 });
console.log("CLASSIC", classic.status());
if (!classic.ok()) {
  console.error("FAIL: classic did not load");
  process.exit(1);
}

await browser.close();
console.log("BROWSER_SMOKE_OK");
