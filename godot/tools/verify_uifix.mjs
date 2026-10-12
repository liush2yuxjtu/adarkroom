#!/usr/bin/env node
/* Playwright audit for P0/P1 UI fixes. Usage: node verify_uifix.mjs <url> <label>
 * label is "before" or "after" (or a round name). Screenshots go to /opt/cursor/artifacts/uifix/.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "/tmp/pw/node_modules/playwright");
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] || "https://adarkroom-zh-git-cursor-godot-chi-149f09-nyn5255-8475s-projects.vercel.app/?fresh=1";
const label = process.argv[3] || "after";
const outDir = "/opt/cursor/artifacts/uifix";
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "1920x1080", width: 1920, height: 1080 }
];

function relLum(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const to = (i) => {
    const v = parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * to(0) + 0.7152 * to(2) + 0.0722 * to(4);
}
function contrast(a, b) {
  const L1 = relLum(a);
  const L2 = relLum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
}

const report = { url, label, at: new Date().toISOString(), viewports: [], supabase: {}, sessionId: null, events: {} };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const failed = [];
page.on("requestfailed", (req) => {
  const u = req.url();
  if (/supabase\.co|playtest_events/.test(u)) {
    failed.push({ url: u, error: req.failure() && req.failure().errorText, method: req.method() });
  }
});

const posts = [];
page.on("response", (res) => {
  const u = res.url();
  if (/playtest_events/.test(u) && res.request().method() === "POST") {
    posts.push({ url: u, status: res.status() });
  }
});

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const shot = path.join(outDir, `${label}_${vp.name}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  const metrics = await page.evaluate(() => {
    const wrap = document.getElementById("wrapper");
    const notes = document.getElementById("notifications");
    const stores = document.getElementById("stores");
    const menuBtns = [...document.querySelectorAll("#menu button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id, text: b.textContent.trim(), w: r.width, h: r.height, x: r.x, y: r.y };
    });
    const all = [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const neg = all.filter((el) => el.getBoundingClientRect().x < -0.5).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.id, cls: el.className, x: r.x, w: r.width, tag: el.tagName };
    });
    const nr = notes ? notes.getBoundingClientRect() : null;
    const disabled = document.querySelector("button.adr[disabled]") || (() => {
      const b = document.createElement("button");
      b.className = "adr";
      b.disabled = true;
      b.innerHTML = '<span class="btn-label">添柴</span><span class="cd-sec">9</span>';
      document.body.appendChild(b);
      return b;
    })();
    const cs = getComputedStyle(disabled);
    const lab = disabled.querySelector(".btn-label") || disabled;
    const sec = disabled.querySelector(".cd-sec") || disabled;
    const color = getComputedStyle(lab).color;
    const bg = cs.backgroundColor;
    const secColor = getComputedStyle(sec).color;
    const meta = document.querySelector('meta[name="viewport"]');
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      wrapW: wrap ? wrap.getBoundingClientRect().width : 0,
      notes: nr && { x: nr.x, y: nr.y, w: nr.width, h: nr.height, visible: nr.width > 0 && nr.right > 0 && nr.left < window.innerWidth },
      stores: stores ? { display: stores.style.display, x: stores.getBoundingClientRect().x } : null,
      menuBtns,
      negX: neg.slice(0, 12),
      disabledColor: color,
      disabledBg: bg,
      cdSecColor: secColor,
      viewportMeta: meta ? meta.getAttribute("content") : null,
      font: getComputedStyle(document.body).fontFamily
    };
  });

  const fg = rgbToHex(metrics.disabledColor);
  const bg = rgbToHex(metrics.disabledBg) || "#ffffff";
  const ratio = fg && bg ? contrast(fg, bg) : null;
  const mobile = vp.width <= 768;
  const menuOk = mobile ? metrics.menuBtns.every((b) => b.h >= 44 && b.w >= 44) : true;
  const noHScroll = metrics.scrollWidth <= metrics.innerWidth + 1;
  const noNeg = metrics.negX.length === 0;
  const notesVis = !!(metrics.notes && metrics.notes.visible && metrics.notes.x >= 0);

  const row = {
    viewport: vp.name,
    shot,
    noNegX: noNeg,
    negX: metrics.negX,
    noHScroll,
    scrollWidth: metrics.scrollWidth,
    innerWidth: metrics.innerWidth,
    notesVisible: notesVis,
    notes: metrics.notes,
    contrast: ratio,
    contrastPass: ratio != null && ratio >= 4.5,
    disabledColor: metrics.disabledColor,
    menuOk,
    menuBtns: metrics.menuBtns,
    viewportMeta: metrics.viewportMeta,
    font: metrics.font
  };
  report.viewports.push(row);
}

// Dedup: force fire-out spam
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(url.replace(/[?&]fresh=1/, "") + (url.includes("?") ? "&" : "?") + "fresh=1&fast=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const g = window.__ADR_GAME;
  if (!g) return;
  g.state.wood_initialized = true;
  g.state.stores.wood = 0;
  g.state.fire = 3;
  g.emit();
});
const fire = page.locator('button.adr[data-key="fire"]');
await fire.waitFor({ timeout: 10000 });
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => {
    const g = window.__ADR_GAME;
    if (g) g.state.cooldowns.stoke = 0;
  });
  await fire.click({ force: true });
}
await page.waitForTimeout(400);
const dedup = await page.evaluate(() => {
  const notes = [...document.querySelectorAll("#notifications .note")].map((n) => n.textContent.trim());
  const wood = notes.filter((t) => t.includes("木头用光了"));
  const tel = JSON.parse(localStorage.getItem("adr.telemetry") || "[]");
  return {
    notes,
    woodLines: wood.length,
    woodText: wood[0] || "",
    hasTimes: wood.some((t) => /×\s*\d+/.test(t)),
    sessionId: tel[0] && tel[0].session_id,
    viewportEvents: tel.filter((e) => e.event_name === "viewport_layout").map((e) => e.payload),
    dedupEvents: tel.filter((e) => e.event_name === "notification_dedup").slice(-5).map((e) => e.payload),
    failEvents: tel.filter((e) => e.event_name === "telemetry_send_fail").length,
    retryOk: tel.filter((e) => e.event_name === "telemetry_retry_ok").length,
    names: tel.reduce((acc, e) => { acc[e.event_name] = (acc[e.event_name] || 0) + 1; return acc; }, {})
  };
});
await page.screenshot({ path: path.join(outDir, `${label}_dedup_1280.png`), fullPage: true });
report.dedup = dedup;
report.sessionId = dedup.sessionId;

await page.waitForTimeout(4000);
report.supabase = { requestfailed: failed, posts };
report.failCount = await page.evaluate(() => window.ADRTelemetry ? ADRTelemetry.failCount() : null);

await browser.close();
const out = path.join(outDir, `report_${label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(0);
