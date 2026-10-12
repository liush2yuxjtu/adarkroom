/**
 * Headless sandbox for the remake engine (godot/build/web/engine.js) and, optionally,
 * the browser telemetry layer (telemetry.js + sinks/supabase.js) with a MOCKED sink.
 * Nothing here touches the network or production Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(here, "../../../godot/build/web");
export const DATA_DIR = path.resolve(here, "../../../godot/data");

export function loadEvents() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "events.json"), "utf8"));
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

/**
 * @param {object} o
 * @param {boolean} [o.webdriver]   navigator.webdriver
 * @param {string}  [o.ua]          navigator.userAgent
 * @param {boolean} [o.telemetry]   also load telemetry.js + sinks/supabase.js
 * @param {object}  [o.storage]     share a localStorage between sandboxes (save/load tests)
 */
export function makeSandbox(o = {}) {
  const clock = { t: 1_700_000_000_000 };
  const posted = [];
  const beacons = [];
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    navigator: {
      userAgent: o.ua || "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
      webdriver: !!o.webdriver,
      sendBeacon: (url, blob) => { beacons.push({ url: "[redacted]", size: blob && blob.size }); return o.beaconOk !== false; }
    },
    localStorage: o.storage || memoryStorage(),
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    URLSearchParams,
    Blob,
    fetch: o.fetch || (async () => { throw new Error("network disabled in verify sandbox"); }),
    __clock: clock,
    __posted: posted
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext("Date.now = function () { return __clock.t; };", ctx);
  if (o.seed != null) {
    // Deterministic Math.random (mulberry32) so story runs are reproducible.
    ctx.__seed = o.seed >>> 0;
    vm.runInContext("Math.random = function () { var t = (__seed += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };", ctx);
  }
  if (o.telemetry) {
    // Mocked endpoint: the fetch above records nothing real; ADRSupabaseSink.postRows is replaced below.
    vm.runInContext('globalThis.ADR_TELEMETRY = { url: "https://example.invalid/rest/v1/playtest_events", anonKey: "verify-sandbox" };', ctx);
    vm.runInContext(fs.readFileSync(path.join(WEB_DIR, "sinks/supabase.js"), "utf8"), ctx, { filename: "supabase.js" });
    vm.runInContext(fs.readFileSync(path.join(WEB_DIR, "telemetry.js"), "utf8"), ctx, { filename: "telemetry.js" });
  }
  vm.runInContext(fs.readFileSync(path.join(WEB_DIR, "engine.js"), "utf8"), ctx, { filename: "engine.js" });
  return {
    ctx,
    ADR: ctx.ADR,
    clock,
    posted,
    beacons,
    advance(ms) { clock.t += ms; }
  };
}

/** Buffer of events as seen by whichever logging path is active. */
export function bufferOf(sb, game) {
  if (sb.ctx.ADRTelemetry) return sb.ctx.ADRTelemetry._state.buffer;
  return game.analytics.buffer;
}

export function tickGame(sb, game, sec, step = 0.25) {
  const n = Math.ceil(sec / step);
  for (let i = 0; i < n; i++) {
    sb.advance(step * 1000);
    game.tick(step);
  }
}
