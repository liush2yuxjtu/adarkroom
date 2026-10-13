#!/usr/bin/env node
/* Gate: live-play telemetry.
 * Opens a deployed (prod or preview) URL in headless Chromium, plays scripted actions for
 * DUR_SEC (default 90s), and asserts:
 *   1. >= 1 POST /api/playtest_events returned 2xx, and no POST returned >= 400;
 *   2. the POSTed rows for this run's session_id include session_start, player_action, save_write;
 *   3. (if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set) Supabase has rows for that session_id
 *      with occurred_at inside the run window and the same required event types.
 * Without a service key, step 3 prints the SQL to run read-only via the Supabase MCP execute_sql.
 * Usage: node tools/verify/live-telemetry.mjs [url]   env: DUR_SEC, PROXY, CHROME, OUT
 * Exit 0 = PASS, 1 = FAIL. Never prints keys.
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. */
import { chromium } from "playwright";
import fs from "node:fs";

const URL_ = process.argv[2] || process.env.URL || "https://adarkroom-zh.vercel.app/";
const DUR = Number(process.env.DUR_SEC || 90) * 1000;
const OUT = process.env.OUT || "/tmp/adr-verify/live-telemetry.json";
const REQUIRED = ["session_start", "player_action", "save_write"];
const log = (...a) => console.log(new Date().toISOString(), ...a);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  proxy: process.env.PROXY ? { server: process.env.PROXY } : undefined
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const posts = [];
const sentEvents = new Map();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("request", (r) => {
  if (!r.url().includes("/api/playtest_events") || r.method() !== "POST") return;
  try {
    for (const row of [].concat(JSON.parse(r.postData() || "[]"))) {
      const k = row.session_id + "|" + row.event_name;
      sentEvents.set(k, (sentEvents.get(k) || 0) + 1);
    }
  } catch { /* beacon bodies may be opaque */ }
});
page.on("response", async (r) => {
  if (!r.url().includes("/api/playtest_events") || r.request().method() !== "POST") return;
  const rec = { status: r.status(), at: new Date().toISOString() };
  if (rec.status >= 300) { try { rec.body = (await r.text()).slice(0, 300); } catch {} }
  posts.push(rec);
});

const windowStart = new Date(Date.now() - 5000);
await page.goto(URL_, { waitUntil: "load" });
await page.waitForFunction(() => self.ADRTelemetry && ADRTelemetry.sessionId(), null, { timeout: 15000 });
const sid = await page.evaluate(() => ADRTelemetry.sessionId());
log("session_id", sid);

const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < DUR) {
  const btns = page.locator("#wrapper button:visible, #header [role=tab]:visible, #header .header-button:visible");
  const n = await btns.count();
  for (let k = 0; k < n; k++) {
    try { await btns.nth(k).hover({ timeout: 300 }); await btns.nth(k).click({ timeout: 500 }); } catch {}
  }
  const ov = page.locator("#overlay button:visible");
  if (await ov.count()) { try { await ov.first().click({ timeout: 500 }); } catch {} }
  if (i === 10) { try { await page.click("#btn-settings", { timeout: 800 }); await page.waitForTimeout(500); await page.keyboard.press("Escape"); } catch {} }
  if (i === 15) { try { await page.click("#btn-style", { timeout: 800 }); await page.waitForTimeout(400); await page.click("#btn-style", { timeout: 800 }); } catch {} }
  i++;
  await page.waitForTimeout(1000);
}
try { await page.evaluate(() => ADRTelemetry.flush && ADRTelemetry.flush("verify")); } catch {}
await page.waitForTimeout(3000);
await page.close({ runBeforeUnload: true });
await new Promise((r) => setTimeout(r, 2000));
await browser.close();
const windowEnd = new Date();

const fails = [];
const ok2xx = posts.filter((p) => p.status >= 200 && p.status < 300).length;
const bad = posts.filter((p) => p.status >= 400);
if (ok2xx < 1) fails.push("no 2xx POST /api/playtest_events");
if (bad.length) fails.push(bad.length + " POST(s) >= 400: " + JSON.stringify(bad.slice(0, 3)));
const sentTypes = [...sentEvents.keys()].filter((k) => k.startsWith(sid + "|")).map((k) => k.split("|")[1]);
for (const ev of REQUIRED) if (!sentTypes.includes(ev)) fails.push("client never POSTed " + ev);

let db = null;
const sql = `select event_name, count(*), min(occurred_at), max(occurred_at) from public.playtest_events where session_id = '${sid}' and occurred_at between '${windowStart.toISOString()}' and '${windowEnd.toISOString()}' group by 1 order by 2 desc;`;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const q = `${process.env.SUPABASE_URL}/rest/v1/playtest_events?select=event_name,occurred_at&session_id=eq.${sid}` +
    `&occurred_at=gte.${windowStart.toISOString()}&occurred_at=lte.${windowEnd.toISOString()}&limit=10000`;
  const rows = await (await fetch(q, { headers: { apikey: key, Authorization: "Bearer " + key } })).json();
  db = {};
  for (const r of rows) db[r.event_name] = (db[r.event_name] || 0) + 1;
  for (const ev of REQUIRED) if (!db[ev]) fails.push("Supabase has no " + ev + " row for " + sid + " in window");
} else {
  log("No service key: run this READ-ONLY via Supabase MCP execute_sql (project ywwguestvujaoimlqznq) and require session_start, player_action, save_write rows:");
  console.log(sql);
}

const result = {
  gate: "live-play-telemetry", url: URL_, session_id: sid,
  window: [windowStart.toISOString(), windowEnd.toISOString()],
  posts: posts.length, posts_2xx: ok2xx, bad_posts: bad, sent_event_types: sentTypes,
  supabase_counts: db, supabase_sql: sql, console_errors: consoleErrors.slice(0, 20),
  pass: fails.length === 0, fails
};
fs.mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
log(result.pass ? "PASS" : "FAIL", JSON.stringify({ posts: posts.length, posts_2xx: ok2xx, fails }));
process.exit(result.pass ? 0 : 1);
