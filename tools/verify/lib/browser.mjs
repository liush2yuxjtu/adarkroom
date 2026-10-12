import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { VERIFY_ROOT } from "./config.mjs";

const require = createRequire(import.meta.url);

function firstExisting(candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

export function resolvePlaywright() {
  const pkg = process.env.PLAYWRIGHT_PKG;
  const tries = [];
  if (pkg) tries.push(pkg);
  tries.push(
    path.join(VERIFY_ROOT, "node_modules/playwright"),
    "/tmp/pw/node_modules/playwright",
    path.join(VERIFY_ROOT, "../../node_modules/playwright")
  );
  const found = firstExisting(tries.map((p) => path.join(p, "package.json")).concat(tries));
  if (found && found.endsWith("package.json")) return path.dirname(found);
  if (found) return found;
  return path.join(VERIFY_ROOT, "node_modules/playwright");
}

export async function launchBrowser() {
  const pwPath = resolvePlaywright();
  const { chromium } = require(pwPath);
  const chrome = firstExisting([
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ]);
  return chromium.launch({
    headless: true,
    executablePath: chrome || undefined,
    args: ["--font-render-hinting=none"]
  });
}

export async function openPage(browser, { viewport, url, style, fresh = true, saveRaw, extraInit } = {}) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 800 },
    locale: "zh-CN",
    deviceScaleFactor: 1
  });
  if (style || saveRaw != null) {
    await context.addInitScript(
      ({ style: st, saveRaw: raw }) => {
        try {
          if (st === "pixel" || st === "text") localStorage.setItem("adr.style", st);
          if (raw != null) {
            if (raw === "") localStorage.removeItem("adr.save.v1");
            else localStorage.setItem("adr.save.v1", raw);
          }
        } catch (e) { /* ignore */ }
      },
      { style, saveRaw: saveRaw == null ? null : saveRaw }
    );
  }
  if (extraInit) await context.addInitScript(extraInit);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const posts = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err && err.message ? err.message : err));
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
  const target = url;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ADR_GAME, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(250);
  return { context, page, consoleErrors, pageErrors, failed, posts };
}

export function classifyNetwork(failed, posts) {
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

export async function realClick(page, locator) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  if (!(await el.count())) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

export async function seedPlayState(page, extra = {}) {
  await page.evaluate((extraState) => {
    const g = window.__ADR_GAME;
    if (!g || !g.state) return;
    g.state.fire = extraState.fire != null ? extraState.fire : 2;
    g.state.temperature = extraState.temperature != null ? extraState.temperature : 2;
    g.state.wood_initialized = extraState.wood_initialized !== false;
    g.state.stores = g.state.stores || {};
    if (extraState.stores) {
      Object.assign(g.state.stores, extraState.stores);
    } else if (g.state.stores.wood == null || g.state.stores.wood === 0) {
      g.state.stores.wood = 12;
    }
    const notes = extraState.notifications || [
      { text: "火堆燃起来了。", count: 1 },
      { text: "木头已经够生火了。", count: 2 },
      { text: "风穿过墙缝。", count: 1 }
    ];
    g.state.notifications = notes;
    if (typeof g.emit === "function") g.emit();
    if (typeof g.hud === "function") g.hud();
  }, extra);
  await page.waitForTimeout(200);
}

export function repoFile(...parts) {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ...parts);
}
