#!/usr/bin/env node
/**
 * Step 10 — Extreme cases: long text, zero resources, 1e9 stores,
 * corrupted saves (invalid JSON, missing fields, wrong types).
 */
import fs from "node:fs";
import path from "node:path";
import { emptySuite, fail, ok } from "./lib/report.mjs";
import { VIEWPORTS, VERIFY_ROOT, targetUrl } from "./lib/config.mjs";
import { launchBrowser, openPage } from "./lib/browser.mjs";
import {
  attachCdp,
  layoutMetrics,
  queryBox,
  queryAllBoxes,
  getDocumentRoot
} from "./lib/cdp.mjs";
import { overflowX, roundRect } from "./lib/geometry.mjs";

const FIXTURES = path.join(VERIFY_ROOT, "fixtures/saves");
const LONG_ZH =
  "风穿过墙缝，把火堆的灰吹到远处，而建造者低声说着一段极长的话：木头、陷阱、毛皮、罗盘与游牧人的交易都堆在同一句里，用来检验卡片会不会把正文裁成一个字。";

function saveDoc(state) {
  return JSON.stringify({ v: 1, save_id: "verify-extreme", saved_at: new Date().toISOString(), state });
}

function baseState(over = {}) {
  return Object.assign(
    {
      session_id: "verify-extreme",
      started_at: Date.now(),
      game_time_sec: 30,
      fire: 2,
      temperature: 2,
      builder_level: 1,
      npc_moods: { builder: "unknown", nomad: "neutral", villagers: "neutral" },
      stores: { wood: 8, fur: 0, meat: 0, scales: 0, teeth: 0, cloth: 0, charm: 0, bait: 0, compass: 0, cured_meat: 0 },
      wood_initialized: true,
      buildings: { trap: 0, cart: 0, hut: 0 },
      population: 0,
      workers: { gatherer: 0 },
      unlocked: { room: true, outside: false, path: false, world: false },
      location: "room",
      phase: "room_fire",
      flags: { wake_line: true },
      notifications: [{ text: "火堆燃起来了。", count: 1 }],
      cooldowns: {},
      cooldown_ends_at: {},
      income_acc: { builder: 0, gatherer: 0 },
      outfit: { meat: 0, cured_meat: 0 },
      world: { on_expedition: false, size: 11, x: 5, y: 5, water: 10, hp: 10, max_hp: 10, food_moves: 0, visited: {}, landmarks: {} }
    },
    over
  );
}

async function telemetryNames(page) {
  const evs = await page.evaluate(() => {
    var mem = [];
    try {
      if (window.ADRTelemetry && Array.isArray(window.ADRTelemetry.buffer)) {
        mem = window.ADRTelemetry.buffer.slice();
      }
    } catch (e1) { /* ignore */ }
    var ls = [];
    try {
      ls = JSON.parse(localStorage.getItem("adr.telemetry") || "[]");
    } catch (e2) { /* ignore */ }
    return mem.concat(Array.isArray(ls) ? ls : []);
  });
  return {
    names: evs.map((e) => e && e.event_name).filter(Boolean),
    events: evs
  };
}

function gameOk(pageErrors) {
  return pageErrors.filter((m) => !/FFTM|OTS parsing|Failed to load/.test(m));
}

export async function runExtremes({ browser, url, styles }) {
  const suite = emptySuite("extremes");
  const ownBrowser = !browser;
  if (!browser) browser = await launchBrowser();
  const styleList = styles && styles.length ? styles : ["pixel", "text"];
  const cases = [
    {
      id: "long-text",
      saveRaw: saveDoc(
        baseState({
          notifications: [
            { text: LONG_ZH, count: 1 },
            { text: "短讯", count: 1 }
          ]
        })
      )
    },
    {
      id: "resources-zero",
      saveRaw: saveDoc(
        baseState({
          fire: 0,
          temperature: 0,
          wood_initialized: true,
          stores: { wood: 0, fur: 0, meat: 0, scales: 0, teeth: 0, cloth: 0, charm: 0, bait: 0, compass: 0, cured_meat: 0 }
        })
      )
    },
    {
      id: "huge-1e9",
      saveRaw: saveDoc(
        baseState({
          stores: { wood: 1e9, fur: 1e9, meat: 0, scales: 0, teeth: 0, cloth: 0, charm: 0, bait: 0, compass: 0, cured_meat: 0 }
        })
      )
    },
    {
      id: "corrupt-json",
      saveRaw: "{not json",
      expectCorrupt: true
    },
    {
      id: "missing-fields",
      saveRaw: JSON.stringify({ v: 1 }),
      expectCorrupt: true
    },
    {
      id: "wrong-types",
      saveRaw: JSON.stringify({
        v: 1,
        state: {
          stores: "lots of wood",
          notifications: { text: "broken" },
          fire: "hot",
          unlocked: true,
          buildings: 3
        }
      }),
      expectCorrupt: true
    }
  ];

  try {
    for (const style of styleList) {
      for (const c of cases) {
        const vp = VIEWPORTS[1280];
        const target = targetUrl(url, { style, fresh: false });
        const opened = await openPage(browser, {
          viewport: vp,
          url: target,
          style,
          fresh: false,
          saveRaw: c.saveRaw
        });
        const { page, context, pageErrors } = opened;
        const prefix = `${style}:${c.id}`;
        try {
          const booted = await page.evaluate(() => !!(window.__ADR_GAME && window.__ADR_GAME.state));
          if (!booted) {
            fail(suite, { id: `${prefix}:boot`, kind: "error", detail: "game did not boot" });
            continue;
          }
          const runtime = gameOk(pageErrors);
          if (runtime.length) {
            fail(suite, {
              id: `${prefix}:uncaught`,
              kind: "error",
              detail: runtime.slice(0, 4).join(" | ")
            });
          } else {
            ok(suite, { id: `${prefix}:uncaught`, kind: "error", detail: "none" });
          }

          const client = await attachCdp(page);
          const metrics = await layoutMetrics(client);
          if (overflowX(metrics.contentSize.width, metrics.viewport.width)) {
            fail(suite, {
              id: `${prefix}:overflow-x`,
              kind: "overflow",
              detail: `${metrics.contentSize.width} > ${metrics.viewport.width}`
            });
          } else {
            ok(suite, { id: `${prefix}:overflow-x`, kind: "overflow" });
          }

          const state = await page.evaluate(() => {
            const s = window.__ADR_GAME.state;
            return {
              fire: s.fire,
              storesType: typeof s.stores,
              storesWood: s.stores && s.stores.wood,
              notesIsArray: Array.isArray(s.notifications),
              noteText: (s.notifications && s.notifications[0] && s.notifications[0].text) || "",
              noteCount: (s.notifications || []).length,
              location: s.location
            };
          });

          if (c.id === "long-text") {
            const rootId = await getDocumentRoot(client);
            const notes = await queryAllBoxes(client, "#notifications .note");
            const texts = await queryAllBoxes(client, "#notifications .px-note-text, #notifications .note-text");
            const card = notes.find((n) => n.box && n.box.w > 0);
            const body = texts.find((n) => n.box && n.box.w > 0);
            if (!body) {
              fail(suite, {
                id: `${prefix}:clipped-text`,
                kind: "clip",
                detail: "long notification has no visible text box (full message lost)"
              });
            } else if (card && body.box.w + 2 < 40) {
              fail(suite, {
                id: `${prefix}:clipped-text`,
                kind: "clip",
                detail: `long text visible width ${Math.round(body.box.w)}px — only a glyph fits`,
                card: roundRect(card.box),
                text: roundRect(body.box)
              });
            } else if (card && body.box.w > card.box.w + 4) {
              fail(suite, {
                id: `${prefix}:clipped-text`,
                kind: "clip",
                detail: `note content ${Math.round(body.box.w)} vs visible ${Math.round(card.box.w)}`,
                card: roundRect(card.box),
                text: roundRect(body.box)
              });
            } else {
              ok(suite, { id: `${prefix}:clipped-text`, kind: "clip", detail: "text visible" });
            }
            if (!state.noteText || state.noteText.length < 20) {
              fail(suite, {
                id: `${prefix}:state-text`,
                kind: "clip",
                detail: "long notification text missing from state"
              });
            }
          }

          if (c.id === "resources-zero") {
            if (state.storesType !== "object") {
              fail(suite, { id: `${prefix}:stores-type`, kind: "error", detail: String(state.storesType) });
            }
            if (Number(state.storesWood) !== 0) {
              fail(suite, {
                id: `${prefix}:wood`,
                kind: "error",
                detail: `expected wood 0, got ${state.storesWood}`
              });
            } else {
              ok(suite, { id: `${prefix}:zero`, kind: "state", detail: "wood=0" });
            }
          }

          if (c.id === "huge-1e9") {
            const rows = await queryAllBoxes(client, "#stores .store-row, #stores .px-stack");
            const nums = await queryAllBoxes(client, "#stores .px-store-n, #stores .n");
            const icons = await queryAllBoxes(client, "#stores .px-icon");
            const tall = rows.filter((r) => r.box && r.box.h > 400);
            if (tall.length) {
              fail(suite, {
                id: `${prefix}:icon-column`,
                kind: "overflow",
                detail: `store row height ${Math.round(tall[0].box.h)}px with 1e9 — cap icons and show the number`,
                box: roundRect(tall[0].box)
              });
            }
            const shown = nums.filter((n) => n.box && n.box.w > 4 && n.box.h > 4);
            if (style === "pixel" && shown.length === 0) {
              fail(suite, {
                id: `${prefix}:no-number`,
                kind: "clip",
                detail: "1e9 stores show no numeric count",
                iconCount: icons.length
              });
            } else {
              ok(suite, { id: `${prefix}:number`, kind: "state", detail: `num boxes ${shown.length}` });
            }
            if (icons.length > 24) {
              fail(suite, {
                id: `${prefix}:icon-cap`,
                kind: "overflow",
                detail: `${icons.length} store icons for 1e9 — cap the stack`
              });
            }
          }

          if (c.expectCorrupt) {
            if (state.storesType !== "object") {
              fail(suite, {
                id: `${prefix}:recover-stores`,
                kind: "save",
                detail: `stores type ${state.storesType} after corrupt save — expected object recovery`
              });
            }
            if (!state.notesIsArray) {
              fail(suite, {
                id: `${prefix}:recover-notes`,
                kind: "save",
                detail: "notifications not an array after corrupt save"
              });
            }
            if (typeof state.fire !== "number" || Number.isNaN(state.fire)) {
              fail(suite, {
                id: `${prefix}:recover-fire`,
                kind: "save",
                detail: `fire=${state.fire}`
              });
            }
            const tel = await telemetryNames(page);
            const corrupt = tel.names.includes("save_corrupt");
            const recover = tel.names.includes("save_recover");
            if (!corrupt) {
              fail(suite, {
                id: `${prefix}:save_corrupt`,
                kind: "save",
                detail: "wrong-type/invalid save accepted silently: no save_corrupt event",
                names: tel.names.slice(0, 12)
              });
            } else {
              ok(suite, { id: `${prefix}:save_corrupt`, kind: "save" });
            }
            if (!recover) {
              fail(suite, {
                id: `${prefix}:save_recover`,
                kind: "save",
                detail: "no save_recover telemetry after corrupt save"
              });
            } else {
              ok(suite, { id: `${prefix}:save_recover`, kind: "save" });
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    if (ownBrowser) await browser.close();
  }

  const invalidPath = path.join(FIXTURES, "invalid.txt");
  if (fs.existsSync(invalidPath)) {
    ok(suite, { id: "fixtures-present", kind: "save", detail: "fixtures/saves committed" });
  }
  return suite;
}

const invoked = process.argv[1] && process.argv[1].endsWith("extremes.mjs");
if (invoked) {
  const { parseArgs } = await import("./lib/config.mjs");
  const { summarize, printHuman } = await import("./lib/report.mjs");
  const args = parseArgs();
  const suite = await runExtremes(args);
  const summary = summarize([suite], { url: args.url });
  printHuman(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.exitCode);
}
