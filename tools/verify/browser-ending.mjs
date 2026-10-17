#!/usr/bin/env node
/**
 * Browser ending check: play the real web game (default: the deployed playtest URL)
 * from a fresh save to the ending screen in headless Chromium, with screenshots.
 *
 * How it gets there in ~1–2 minutes instead of ~24 game hours:
 *   1. Fresh save (?fresh=1). The fire is lit with a real mouse click on 生火.
 *   2. The same policy as playthrough.mjs (playWith) runs INSIDE the page against
 *      window.__ADR_GAME, calling the same game.act(...) actions the buttons call,
 *      with the in-game time scale (20x, the engine max) and a test-only clock
 *      offset injected by this harness (Date.now is what cooldowns read). Nothing
 *      in the shipped game changes. It stops right before lift-off.
 *   3. Ship → space → ending is played live in the page: real clicks on 原速/加速,
 *      起飞 and the liftoff warning's button, then ~30 s of real-time flight
 *      with a small autopilot dodging rocks through the same space_steer action
 *      the arrow keys send. The ending panel (#panel-ending) is asserted live.
 * Milestones reached during step 2 (village, world map, mines, wreck) are saved
 * with the game's own save (persistSave → localStorage adr.save.v1) at the moment
 * they happen and re-opened in a fresh tab for the screenshot.
 *
 * Telemetry POSTs (/api/playtest_events, *.supabase.co) are answered locally so
 * the bot run does not land in the playtest table. Math.random is seeded (same
 * seed as playthrough.mjs) so the map and fights are reproducible.
 *
 *   node tools/verify/browser-ending.mjs [--url URL] [--out DIR] [--seed 7]
 *   node tools/verify/run.mjs --only browser-ending
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, targetUrl } from "./lib/config.mjs";
import { emptySuite, ok, fail, warn, summarize, printHuman, writeJson } from "./lib/report.mjs";
import { STAGES, landmarkKey, parseXY, stepToward, pathHome } from "./lib/playthrough-policy.mjs";
import { playWith } from "./playthrough.mjs";

const VIEWPORT = { width: 1280, height: 800 };
const TELEMETRY_RE = /\/api\/playtest_events|supabase\.co\//;
const SNAP_STAGES = ["village", "world", "mines", "dungeon"];

/** Test-only init script: clock offset + seeded Math.random. Never shipped. */
function harnessInit({ seed }) {
  const realNow = Date.now.bind(Date);
  let offset = 0;
  Date.now = function () { return realNow() + offset; };
  window.__adrVerifyAdvance = function (ms) { offset += ms; };
  if (seed != null) {
    let st = seed >>> 0;
    Math.random = function () {
      let t = (st += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

async function newCtx(browser, { seed, saveRaw } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: "zh-CN", deviceScaleFactor: 1, bypassCSP: true });
  await context.route(TELEMETRY_RE, (r) => r.fulfill({ status: 201, contentType: "application/json", body: "[]" }));
  await context.addInitScript(harnessInit, { seed });
  if (saveRaw) {
    await context.addInitScript((raw) => { try { localStorage.setItem("adr.save.v1", raw); } catch (e) { /* ignore */ } }, saveRaw);
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String((e && e.message) || e)));
  return { context, page, pageErrors };
}

async function waitGame(page) {
  await page.waitForFunction(() => window.__ADR_GAME && window.__ADR_GAME.state, null, { timeout: 30000 });
  await page.waitForTimeout(400);
}

async function clickKey(page, sel) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: "visible", timeout: 10000 });
  await el.click({ timeout: 10000 });
}

export async function runBrowserEnding(opts = {}) {
  const suite = emptySuite("browser-ending");
  const outDir = path.join(opts.outDir || path.resolve("artifacts"), "browser-ending");
  fs.mkdirSync(outDir, { recursive: true });
  const seed = opts.seed == null ? 7 : opts.seed;
  const base = opts.url;
  const shots = [];
  const shot = async (page, name, note) => {
    const file = path.join(outDir, name + ".png");
    await page.screenshot({ path: file });
    shots.push({ name, file, note });
  };
  const t0 = Date.now();
  let ownBrowser = null;
  let browser = opts.browser;
  if (!browser) {
    const { launchBrowser } = await import("./lib/browser.mjs");
    browser = ownBrowser = await launchBrowser();
  }
  const report = { url: base, seed, stages: {}, shots, timings: {} };
  try {
    const { context, page, pageErrors } = await newCtx(browser, { seed });
    await page.goto(targetUrl(base, { fresh: true }), { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitGame(page);
    await shot(page, "00-start", "fresh save, dark room");

    // 1. Real click: light the fire.
    await clickKey(page, '#room-btns [data-key="fire"]');
    await page.waitForTimeout(600);
    const fire = await page.evaluate(() => window.__ADR_GAME.state.fire);
    if (fire > 0) ok(suite, { id: "fire-lit-by-click", actual: `fire=${fire}` });
    else fail(suite, { id: "fire-lit-by-click", detail: `fire=${fire} after clicking 生火` });
    await shot(page, "01-fire-lit", "after a real click on 生火");

    // 2. In-page policy up to lift-off.
    const tA = Date.now();
    const res = await page.evaluate(async ({ src, helpers, snapStages, maxGameSec }) => {
      const g = window.__ADR_GAME;
      const play = (0, eval)("(" + src + ")");
      const policy = { STAGES: helpers.STAGES };
      for (const k of ["landmarkKey", "parseXY", "stepToward", "pathHome"]) policy[k] = (0, eval)("(" + helpers[k] + ")");
      const snaps = {};
      const marks = {};
      const realAct = g.act.bind(g);
      const STOP = { stop: "lift_off" };
      g.act = function (name, args) {
        if (name === "lift_off") throw STOP;
        return realAct(name, args);
      };
      let stopped = false;
      let error = null;
      try {
        play({
          g,
          events: g.events,
          advance: (ms) => window.__adrVerifyAdvance(ms),
          now: () => performance.now(),
          maxGameSec,
          timeScale: 50,
          policy,
          restartAfterEnding: false,
          onMark: (id, st) => {
            marks[id] = st;
            if (snapStages.includes(id)) {
              g.persistSave(true);
              snaps[id] = localStorage.getItem("adr.save.v1");
            }
          }
        });
      } catch (e) {
        if (e === STOP) stopped = true;
        else error = String((e && e.stack) || e);
      } finally {
        g.act = realAct;
      }
      const s = g.state;
      return {
        stopped, error, marks, snaps,
        location: s.location,
        hull: s.spaceShip && s.spaceShip.hull,
        unlocked_ship: !!s.unlocked.ship,
        timeScale: g.timeScale,
        game_time_sec: Math.round(s.game_time_sec)
      };
    }, {
      src: playWith.toString(),
      helpers: { STAGES, landmarkKey: landmarkKey.toString(), parseXY: parseXY.toString(), stepToward: stepToward.toString(), pathHome: pathHome.toString() },
      snapStages: SNAP_STAGES,
      maxGameSec: 120000
    });
    report.timings.policy_ms = Date.now() - tA;
    report.stages = res.marks;
    report.before_liftoff = { location: res.location, hull: res.hull, game_time_sec: res.game_time_sec, timeScale: res.timeScale };
    if (res.error) fail(suite, { id: "policy-run", detail: res.error.slice(0, 800) });
    for (const id of ["room_fire", "stranger", "forest", "village", "village_econ", "path", "world", "combat", "mines", "dungeon", "ship", "fabricator"]) {
      const m = res.marks[id];
      if (m) ok(suite, { id: "stage:" + id, actual: `@${m.t}s game` });
      else fail(suite, { id: "stage:" + id, detail: `not reached in browser (loc=${res.location})` });
    }
    if (res.stopped) ok(suite, { id: "reached-liftoff", actual: `hull=${res.hull} @${res.game_time_sec}s game` });
    else fail(suite, { id: "reached-liftoff", detail: `policy ended without trying lift-off (loc=${res.location}, hull=${res.hull})` });

    // 3. Live: ship → space → ending.
    let ended = false;
    if (res.stopped) {
      await page.evaluate(() => window.__ADR_GAME.act("travel", { area: "ship" }));
      await page.waitForTimeout(500);
      // Speed button cycles 1x ↔ 2x; from the policy's 20x one click lands on 1x, the next on 2x.
      for (let i = 0; i < 3; i++) {
        const sc = await page.evaluate(() => window.__ADR_GAME.timeScale);
        if (sc === 2) break;
        await clickKey(page, "#btn-hyper");
        await page.waitForTimeout(150);
      }
      report.flight_time_scale = await page.evaluate(() => window.__ADR_GAME.timeScale);
      await shot(page, "05-ship", "ship panel before lift-off");
      const tB = Date.now();
      for (let attempt = 1; attempt <= 4 && !ended; attempt++) {
        // Lift-off cooldown after a crash: skip it with the harness clock, not the game.
        await page.evaluate(() => {
          const g = window.__ADR_GAME;
          if (g.state.location !== "ship") g.act("travel", { area: "ship" });
          for (let i = 0; i < 400 && g.state.location === "ship"; i++) {
            const left = g.state.cooldown_ends_at && g.state.cooldown_ends_at.liftoff;
            if (!left || left <= Date.now()) break;
            window.__adrVerifyAdvance(1000);
            g.tick(0.05);
          }
        });
        await page.waitForTimeout(300);
        await clickKey(page, '#ship-btns [data-key="lift_off"]');
        await page.waitForTimeout(400);
        const warning = await page.evaluate(() => {
          const e = window.__ADR_GAME.state.active_event;
          return e ? e.id : null;
        });
        if (warning === "liftoff_warning") {
          if (attempt === 1) await shot(page, "05b-liftoff-warning", "liftoff warning modal");
          await clickKey(page, '#overlay [data-key="ev-fly"]');
        }
        await page.waitForFunction(() => window.__ADR_GAME.state.location !== "ship", null, { timeout: 5000 }).catch(() => {});
        const loc = await page.evaluate(() => window.__ADR_GAME.state.location);
        if (loc !== "space") {
          fail(suite, { id: `liftoff-${attempt}`, detail: `location=${loc} after clicking 起飞` });
          break;
        }
        // Autopilot: every frame steer away from the nearest rock (same as playthrough.mjs dodgeSpace).
        await page.evaluate(() => {
          const g = window.__ADR_GAME;
          const step = () => {
            const sp = g.state.space;
            if (g.state.location !== "space" || !sp || !sp.active) { window.__adrPilot = false; return; }
            const threats = (sp.asteroids || []).filter((r) => r.y < sp.shipY + 30 && r.y + (r.h || 0) > sp.shipY - 120);
            if (threats.length) {
              const near = threats.reduce((a, b) => (Math.abs(a.x - sp.shipX) < Math.abs(b.x - sp.shipX) ? a : b));
              const dir = sp.shipX >= near.x ? 1 : -1;
              const dx = dir > 0 ? Math.min(40, 690 - sp.shipX) : -Math.min(40, sp.shipX - 10);
              if (dx) g.act("space_steer", { dx });
            }
            requestAnimationFrame(step);
          };
          window.__adrPilot = true;
          requestAnimationFrame(step);
        });
        await page.waitForTimeout(6000);
        if (attempt === 1) await shot(page, "06-space", "mid-flight");
        await page.waitForFunction(() => window.__ADR_GAME.state.location !== "space", null, { timeout: 75000 }).catch(() => {});
        const after = await page.evaluate(() => ({ loc: window.__ADR_GAME.state.location, ending: !!window.__ADR_GAME.state.ending }));
        if (after.ending) ended = true;
        else warn(suite, { id: `flight-${attempt}`, detail: `ship crashed (loc=${after.loc}); retrying` });
      }
      report.timings.flight_ms = Date.now() - tB;
    }
    if (ended) ok(suite, { id: "ending-reached", actual: "state.ending = true after a live flight" });
    else fail(suite, { id: "ending-reached", detail: "did not reach state.ending" });

    await page.waitForTimeout(800);
    const end = await page.evaluate(() => {
      const p = document.getElementById("panel-ending");
      const cs = p ? getComputedStyle(p) : null;
      const r = p ? p.getBoundingClientRect() : null;
      const notes = Array.from(document.querySelectorAll("#notifications .note, #notifications > *")).map((n) => n.textContent.trim()).filter(Boolean);
      return {
        exists: !!p,
        active: !!(p && p.classList.contains("active")),
        visible: !!(p && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0),
        text: p ? p.innerText.trim() : "",
        restart: !!(p && p.querySelector('[data-key="end-restart"]')),
        notes: notes.slice(0, 8),
        style: document.documentElement.dataset.style || document.body.dataset.style || null
      };
    });
    report.ending_panel = end;
    await shot(page, "07-ending", "ending screen, live");
    if (end.visible && end.active) ok(suite, { id: "panel-ending-visible", actual: "visible + active" });
    else fail(suite, { id: "panel-ending-visible", detail: JSON.stringify({ exists: end.exists, active: end.active, visible: end.visible }) });
    const endText = /信标|太空|空气|得分/;
    const textHit = endText.test(end.text) || end.notes.some((n) => endText.test(n));
    if (textHit) ok(suite, { id: "ending-text", actual: (end.notes.find((n) => endText.test(n)) || end.text).slice(0, 80) });
    else fail(suite, { id: "ending-text", detail: "no ending text in #panel-ending or notifications" });
    if (end.restart) ok(suite, { id: "ending-restart-button", actual: "present" });
    else fail(suite, { id: "ending-restart-button", detail: "end-restart button missing" });
    report.page_errors = pageErrors.slice(0, 10);
    if (pageErrors.length) fail(suite, { id: "page-errors", detail: pageErrors.slice(0, 3).join(" | ") });
    else ok(suite, { id: "page-errors", actual: "none" });
    await context.close();

    // Milestones saved during the in-page run, reopened in a fresh tab.
    const labels = { village: "02-village", world: "03-world-map", mines: "04a-mines", dungeon: "04b-wreck" };
    for (const id of SNAP_STAGES) {
      const raw = res.snaps && res.snaps[id];
      if (!raw) { warn(suite, { id: "snapshot:" + id, detail: "no save captured" }); continue; }
      const c = await newCtx(browser, { seed, saveRaw: raw });
      try {
        await c.page.goto(targetUrl(base, { fresh: false }), { waitUntil: "domcontentloaded", timeout: 60000 });
        await waitGame(c.page);
        await c.page.waitForTimeout(500);
        const loc = await c.page.evaluate(() => window.__ADR_GAME.state.location);
        await shot(c.page, labels[id], `save from stage ${id} reopened (location=${loc})`);
        if (c.pageErrors.length) fail(suite, { id: "snapshot-errors:" + id, detail: c.pageErrors.slice(0, 2).join(" | ") });
      } finally {
        await c.context.close();
      }
    }
  } catch (e) {
    fail(suite, { id: "browser-ending", detail: String((e && e.stack) || e).slice(0, 800) });
  } finally {
    if (ownBrowser) await ownBrowser.close();
  }
  report.timings.total_ms = Date.now() - t0;
  shots.sort((a, b) => a.name.localeCompare(b.name));
  suite.report = report;
  writeJson(path.join(outDir, "browser-ending.json"), report);
  return suite;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs();
  const si = process.argv.indexOf("--seed");
  const suite = await runBrowserEnding({ ...args, seed: si > 0 ? Number(process.argv[si + 1]) : 7 });
  const summary = summarize([suite]);
  printHuman(summary);
  console.log(JSON.stringify({ summary, report: suite.report }, null, 2));
  process.exit(summary.exitCode);
}
