#!/usr/bin/env node
/**
 * Orchestrator: CDP layout, screenshot diff, a11y, extremes.
 * Machine-readable JSON on stdout. Exit 1 on any failure.
 *
 *   node tools/verify/run.mjs --url <live-or-local>
 *   node tools/verify/run.mjs --update-baselines
 *   node tools/verify/screenshot-diff.mjs --update
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs, DEFAULT_URL } from "./lib/config.mjs";
import { summarize, printHuman, writeJson } from "./lib/report.mjs";
import { runTelemetry } from "./telemetry.mjs";
import { runStory } from "./story.mjs";
import { runOnboarding } from "./onboarding.mjs";
import { runPlaythrough } from "./playthrough.mjs";
import { runClassicPlaythrough } from "./classic-playthrough.mjs";
import { runParity } from "./parity.mjs";
import { runIncome } from "./income.mjs";
import { runMigration } from "./migration.mjs";

const HELP = `adr verify suite
  node tools/verify/run.mjs [--url URL] [--styles pixel,text] [--widths 360,390,768,1024,1280,1440,1920]
                            [--out artifacts] [--only cdp,screenshots,a11y,extremes,telemetry,story,onboarding,playthrough,classic-playthrough,income,parity,migration] [--update-baselines]

  node tools/verify/screenshot-diff.mjs --update   # rewrite committed baselines
  node tools/verify/run.mjs --only parity          # content parity (opt-in while gaps remain)
  node tools/verify/run.mjs --only migration       # full original→remake review (exit 0 = REVIEW PASS)

Exit 0 = all suites PASS. Exit 1 = any FAIL. JSON report on stdout.
Default URL: ${DEFAULT_URL}
`;

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.error(HELP);
    process.exit(0);
  }
  fs.mkdirSync(args.outDir, { recursive: true });
  // playthrough walks the migrated world (ironmine / world_ironmine / state.ending).
  const only = args.only && args.only.length ? args.only : ["cdp", "screenshots", "a11y", "extremes", "telemetry", "story", "onboarding", "playthrough", "classic-playthrough", "income"];
  const headless = ["telemetry", "story", "onboarding", "playthrough", "classic-playthrough", "income", "parity", "migration"];
  const needsBrowser = only.some((k) => !headless.includes(k));
  let browser = null;
  if (needsBrowser) {
    const { launchBrowser } = await import("./lib/browser.mjs");
    browser = await launchBrowser();
  }
  const suites = [];
  const shared = { browser, ...args };
  try {
    if (only.includes("cdp") || only.includes("cdp-layout")) {
      const { runCdpLayout } = await import("./cdp-layout.mjs");
      suites.push(await runCdpLayout(shared));
    }
    if (only.includes("screenshots") || only.includes("screenshot-diff")) {
      const { runScreenshotDiff } = await import("./screenshot-diff.mjs");
      suites.push(await runScreenshotDiff(shared));
    }
    if (only.includes("a11y")) {
      const { runA11y } = await import("./a11y.mjs");
      suites.push(await runA11y(shared));
    }
    if (only.includes("extremes")) {
      const { runExtremes } = await import("./extremes.mjs");
      suites.push(await runExtremes(shared));
    }
    // Headless engine checks (mocked sink, no network): telemetry contract + story progression.
    if (only.includes("telemetry")) suites.push(runTelemetry());
    if (only.includes("story")) suites.push(runStory({ runs: 3 }));
    if (only.includes("onboarding")) suites.push(runOnboarding());
    if (only.includes("playthrough")) suites.push(runPlaythrough({ seed: 7 }));
    if (only.includes("classic-playthrough")) suites.push(runClassicPlaythrough());
    if (only.includes("income")) suites.push(runIncome());
    // Opt-in while original-content gaps remain; promote to the default list once green.
    if (only.includes("parity")) suites.push(runParity().suite);
    // Review gate: 0 missing / 0 no_producer / 0 numeric mismatch + per-batch reachability.
    if (only.includes("migration")) suites.push(runMigration().suite);
  } finally {
    if (browser) await browser.close();
  }
  const summary = summarize(suites, {
    url: args.url,
    styles: args.styles,
    widths: args.widths,
    updateBaselines: args.updateBaselines,
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
