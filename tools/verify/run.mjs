#!/usr/bin/env node
/**
 * Orchestrator: CDP layout, screenshot diff, a11y, extremes, browser ending + headless engine checks.
 * Machine-readable JSON on stdout. Exit 1 on any failure.
 *
 *   node tools/verify/run.mjs --url <live-or-local>
 *   node tools/verify/run.mjs --update-baselines
 *   node tools/verify/screenshot-diff.mjs --update
 *
 * By default every browser part runs in its own child process with a fresh
 * Chromium, one after another, and the headless parts share one more child.
 * That keeps peak memory at one part's worth (a single-process run used to hit
 * "Page crashed" in extremes on a box with ~2 GB free). --no-split restores the
 * single-process run (still a fresh browser per part).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, DEFAULT_URL } from "./lib/config.mjs";
import { summarize, printHuman, writeJson } from "./lib/report.mjs";

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_PARTS = ["cdp", "screenshots", "a11y", "extremes", "browser-ending", "telemetry", "story", "onboarding", "playthrough", "classic-playthrough", "income"];
const HEADLESS = ["telemetry", "story", "onboarding", "playthrough", "classic-playthrough", "income", "parity", "migration"];
const ALIASES = { "cdp-layout": "cdp", "screenshot-diff": "screenshots" };

const HELP = `adr verify suite
  node tools/verify/run.mjs [--url URL] [--styles pixel,text] [--widths 360,390,768,1024,1280,1440,1920]
                            [--out artifacts] [--only cdp,screenshots,a11y,extremes,browser-ending,telemetry,story,onboarding,playthrough,classic-playthrough,income,parity,migration]
                            [--update-baselines] [--no-split]

  node tools/verify/screenshot-diff.mjs --update   # rewrite committed baselines
  node tools/verify/run.mjs --only parity          # content parity (opt-in while gaps remain)
  node tools/verify/run.mjs --only migration       # full original→remake review (exit 0 = REVIEW PASS)
  node tools/verify/run.mjs --only browser-ending  # real-browser run to the ending, screenshots in <out>/browser-ending/

Default: each browser part in its own child process (low memory). --no-split = one process.
Exit 0 = all suites PASS. Exit 1 = any FAIL. JSON report on stdout.
Default URL: ${DEFAULT_URL}
`;

async function runPart(part, args, browser) {
  switch (part) {
    case "cdp": return (await import("./cdp-layout.mjs")).runCdpLayout({ ...args, browser });
    case "screenshots": return (await import("./screenshot-diff.mjs")).runScreenshotDiff({ ...args, browser });
    case "a11y": return (await import("./a11y.mjs")).runA11y({ ...args, browser });
    case "extremes": return (await import("./extremes.mjs")).runExtremes({ ...args, browser });
    case "browser-ending": return (await import("./browser-ending.mjs")).runBrowserEnding({ ...args, browser });
    // Headless engine checks (mocked sink, no network): telemetry contract + story progression.
    case "telemetry": return (await import("./telemetry.mjs")).runTelemetry();
    case "story": return (await import("./story.mjs")).runStory({ runs: 3 });
    case "onboarding": return (await import("./onboarding.mjs")).runOnboarding();
    case "playthrough": return (await import("./playthrough.mjs")).runPlaythrough({ seed: 7 });
    case "classic-playthrough": return (await import("./classic-playthrough.mjs")).runClassicPlaythrough();
    case "income": return (await import("./income.mjs")).runIncome();
    // Opt-in while original-content gaps remain; promote to the default list once green.
    case "parity": return (await import("./parity.mjs")).runParity().suite;
    // Review gate: 0 missing / 0 no_producer / 0 numeric mismatch + per-batch reachability.
    case "migration": return (await import("./migration.mjs")).runMigration().suite;
    default: return null;
  }
}

/** Run parts in this process; each browser part gets its own Chromium, closed right after. */
async function runInProcess(parts, args) {
  const suites = [];
  for (const part of parts) {
    let browser = null;
    if (!HEADLESS.includes(part)) {
      const { launchBrowser } = await import("./lib/browser.mjs");
      browser = await launchBrowser();
    }
    try {
      const s = await runPart(part, args, browser);
      if (s) suites.push(s);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
  return suites;
}

/** argv for a child: everything except --only / --split flags / --child-report. */
function passthroughArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only" || a === "--child-report") { i++; continue; }
    if (a === "--split" || a === "--no-split") continue;
    out.push(a);
  }
  return out;
}

function runChild(parts, args, label) {
  const logDir = path.join(args.outDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const reportFile = path.join(logDir, `child-${label}.json`);
  const logFile = path.join(logDir, `child-${label}.log`);
  fs.rmSync(reportFile, { force: true });
  const argv = [SELF, ...passthroughArgv(process.argv.slice(2)), "--no-split", "--only", parts.join(","), "--child-report", reportFile];
  const t0 = Date.now();
  return new Promise((resolve) => {
    const log = fs.openSync(logFile, "w");
    const child = spawn(process.execPath, argv, { stdio: ["ignore", log, log] });
    child.on("close", (code, signal) => {
      fs.closeSync(log);
      const wall = Math.round((Date.now() - t0) / 1000);
      console.error(`[verify] ${label}: exit=${code}${signal ? " signal=" + signal : ""} ${wall}s`);
      let suites = null;
      try { suites = JSON.parse(fs.readFileSync(reportFile, "utf8")).suites; } catch (e) { suites = null; }
      if (!suites) {
        const tail = (() => { try { return fs.readFileSync(logFile, "utf8").slice(-1500); } catch (e) { return ""; } })();
        suites = parts.map((name) => ({
          name, pass: false, checks: 1, warnings: [], results: [],
          failures: [{ id: "child-crash", detail: `child exit=${code} signal=${signal || ""}; log ${logFile}: ${tail}` }]
        }));
      }
      resolve(suites);
    });
  });
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.error(HELP);
    process.exit(0);
  }
  fs.mkdirSync(args.outDir, { recursive: true });
  const requested = args.only && args.only.length ? args.only : DEFAULT_PARTS;
  const parts = [...new Set(requested.map((k) => ALIASES[k] || k))];
  let suites = [];
  if (args.childReport || !args.split || parts.length === 1) {
    suites = await runInProcess(parts, args);
  } else {
    // Browser parts one child each; all headless parts share one child.
    const browserParts = parts.filter((p) => !HEADLESS.includes(p));
    const headlessParts = parts.filter((p) => HEADLESS.includes(p));
    for (const p of browserParts) suites.push(...(await runChild([p], args, p)));
    if (headlessParts.length) suites.push(...(await runChild(headlessParts, args, "headless")));
  }
  if (args.childReport) {
    writeJson(args.childReport, { suites });
    process.exit(suites.every((s) => s.pass) ? 0 : 1);
  }
  const summary = summarize(suites, {
    url: args.url,
    styles: args.styles,
    widths: args.widths,
    updateBaselines: args.updateBaselines,
    split: args.split,
    perWidth: Object.fromEntries(
      args.widths.map((w) => [
        w,
        {
          pass: suites.every((s) =>
            s.failures.every((f) => f.width !== w && !String(f.id || "").includes(`@${w}`) && !String(f.id || "").includes(`-${w}`))
          )
        }
      ])
    )
  });
  writeJson(path.join(args.outDir, "report.json"), { summary, suites });
  printHuman(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.exitCode);
}

main().catch((err) => {
  console.error(JSON.stringify({ pass: false, exitCode: 1, error: String(err && err.stack || err) }, null, 2));
  process.exit(1);
});
