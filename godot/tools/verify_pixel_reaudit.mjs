#!/usr/bin/env node
/* Pixel re-audit: issues 2–7 at 1280/1024/390/360/1920, pixel+text.
 * Usage: node godot/tools/verify_pixel_reaudit.mjs <url> <label>
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PKG || "/tmp/pw/node_modules/playwright");
import fs from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://127.0.0.1:8765/";
const label = process.argv[3] || "after";
const outDir = process.env.AUDIT_OUT || "/opt/cursor/artifacts/pixel-reaudit";
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x740", width: 360, height: 740 },
  { name: "1920x1080", width: 1920, height: 1080 }
];
const styles = ["pixel", "text"];

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

const report = { url, label, at: new Date().toISOString(), rounds: [], issues: [] };
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(chrome) ? chrome : undefined
});

for (const style of styles) {
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
    page.on("requestfailed", (req) => {
      failed.push({
        url: req.url(),
        method: req.method(),
        error: (req.failure() && req.failure().errorText) || ""
      });
    });
    page.on("response", (res) => {
      if (res.request().method() === "POST") {
        posts.push({ url: res.url(), status: res.status() });
      }
    });
    const sep = url.includes("?") ? "&" : "?";
    const target = `${url}${sep}style=${style}&fresh=1`;
    await page.goto(target, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => window.__ADR_GAME, { timeout: 20000 });
    await page.waitForTimeout(400);

    const fire = page.locator("#room-btns button[data-key='fire']");
    if (await fire.count()) {
      const box = await fire.first().boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const g = window.__ADR_GAME;
      if (!g) return;
      g.state.wood_initialized = true;
      g.state.stores.wood = 8;
      g.emit();
    });
    await page.waitForTimeout(350);

    const metrics = await page.evaluate(() => {
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
      };
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const captions = [...document.querySelectorAll(".px-caption")].map((el) => {
        const s = cs(el);
        const b = el.getBoundingClientRect();
        return {
          text: el.textContent,
          w: b.width,
          h: b.height,
          fontSize: s.fontSize,
          color: s.color,
          display: s.display
        };
      });
      const tabs = [...document.querySelectorAll("#header button")].map((b) => {
        const box = b.getBoundingClientRect();
        return {
          text: (b.innerText || b.getAttribute("aria-label") || "").slice(0, 16),
          w: box.width,
          h: box.height,
          caption: (b.querySelector(".px-caption") || {}).textContent || ""
        };
      });
      const fireBtn = document.querySelector("button.adr[data-key='fire']");
      const cdSec = fireBtn && fireBtn.querySelector(".cd-sec");
      const hearth = document.querySelector(".px-fire");
      const scene = document.querySelector(".px-scene");
      const icon = document.querySelector(".px-icon");
      const pile = document.querySelector(".px-woodpile");
      const host = document.querySelector(".px-scene-host");
      const legend = document.querySelector(".px-notes-legend");
      const notes = [...document.querySelectorAll("#notifications .note")].map((n) => ({
        title: n.getAttribute("title") || "",
        aria: n.getAttribute("aria-label") || "",
        cue: n.dataset.cue || "",
        caption: (n.querySelector(".px-caption") || {}).textContent || ""
      }));
      const g = window.__ADR_GAME;
      return {
        style: document.documentElement.getAttribute("data-style"),
        wide: document.body.classList.contains("px-wide"),
        captions,
        tabs,
        fireLabel: fireBtn ? (fireBtn.querySelector(".px-caption") || {}).textContent || fireBtn.innerText : "",
        fireAria: fireBtn ? fireBtn.getAttribute("aria-label") : null,
        cdText: cdSec ? cdSec.textContent : "",
        cdLeft: g && g.cooldownLeft ? g.cooldownLeft("stoke") : 0,
        imageRendering: {
          hearth: hearth ? cs(hearth).imageRendering : null,
          scene: scene ? cs(scene).imageRendering : null,
          icon: icon ? cs(icon).imageRendering : null,
          body: cs(document.body).imageRendering
        },
        host: r(host),
        scene: r(scene),
        pile: r(pile),
        pilePos: pile ? pile.style.backgroundPosition : null,
        hearthPos: hearth ? hearth.style.backgroundPosition : null,
        legend: legend ? legend.textContent : null,
        notes,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      };
    });

    const shot = path.join(outDir, `${label}_${style}_${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const cdShot = path.join(outDir, `${label}_${style}_${vp.name}_cooldown.png`);
    if (await fire.count()) await fire.first().screenshot({ path: cdShot }).catch(() => {});

    const net = classifyFailed(failed, posts);
    const findings = [];
    if (style === "pixel") {
      const visibleCaps = (metrics.captions || []).filter(
        (c) => c.text && c.w > 0 && c.h > 0 && c.fontSize !== "0px" && c.display !== "none"
      );
      if (visibleCaps.length < 3) {
        findings.push({ id: 2, kind: "pixel-labels", detail: `visible captions ${visibleCaps.length}` });
      }
      if (!metrics.cdText || !/\d+/.test(metrics.cdText)) {
        findings.push({ id: 3, kind: "pixel-cd-sec", detail: `cdText=${metrics.cdText}` });
      }
      const irs = metrics.imageRendering || {};
      const badIR = Object.entries(irs).filter(([, v]) => v && !/pixelated/i.test(v));
      if (badIR.length) {
        findings.push({ id: 4, kind: "image-rendering", detail: JSON.stringify(irs) });
      }
      if (!metrics.legend || !metrics.notes.every((n) => n.title || n.aria)) {
        findings.push({ id: 6, kind: "note-meaning", detail: `legend=${metrics.legend}` });
      }
      if ((vp.width >= 1024) && metrics.host) {
        const unused = Math.max(0, metrics.innerWidth - metrics.host.right);
        if (unused / metrics.innerWidth > 0.38 && !metrics.wide) {
          findings.push({ id: 7, kind: "wide-blank", detail: `unused=${unused}` });
        }
      }
    } else if (vp.width <= 390) {
      const shortTabs = (metrics.tabs || []).filter((t) => t.h < 44);
      if (shortTabs.length) {
        findings.push({ id: 5, kind: "tab-target", detail: JSON.stringify(shortTabs) });
      }
    }
    if (metrics.scrollWidth > metrics.innerWidth + 2) {
      findings.push({ kind: "horizontal-scroll", detail: `${metrics.scrollWidth}>${metrics.innerWidth}` });
    }

    report.rounds.push({
      style,
      vp: vp.name,
      shot,
      cdShot,
      metrics,
      findings,
      consoleErrors,
      posts: posts.filter((p) => /playtest_events/.test(p.url)),
      ...net
    });
    findings.forEach((f) => report.issues.push({ ...f, style, vp: vp.name, shot }));
    await ctx.close();
  }
}

const out = path.join(outDir, `report_${label}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  url: report.url,
  label,
  issueCount: report.issues.length,
  issues: report.issues,
  out
}, null, 2));
await browser.close();
process.exit(report.issues.length ? 1 : 0);
