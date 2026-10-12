#!/usr/bin/env node
/**
 * Step 8 — Screenshot diff at fixed widths vs committed baselines.
 * Compare pixel and text styles independently. --update writes baselines.
 */
import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { emptySuite, fail, ok } from "./lib/report.mjs";
import { VIEWPORTS, VERIFY_ROOT, SCREENSHOT_THRESHOLD, SCREENSHOT_MAX_RATIO, targetUrl } from "./lib/config.mjs";
import { launchBrowser, openPage, realClick, seedPlayState } from "./lib/browser.mjs";
import { attachCdp, pauseAnimations } from "./lib/cdp.mjs";

export const BASELINE_DIR = path.join(VERIFY_ROOT, "baselines");

export function baselineName(style, width) {
  return `${style}-${width}.png`;
}

function readPng(buf) {
  return PNG.sync.read(buf);
}

function diffPng(aBuf, bBuf, threshold) {
  const imgA = readPng(aBuf);
  const imgB = readPng(bBuf);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      ok: false,
      reason: "size-mismatch",
      a: { w: imgA.width, h: imgA.height },
      b: { w: imgB.width, h: imgB.height },
      mismatched: Infinity,
      ratio: 1
    };
  }
  const out = new PNG({ width: imgA.width, height: imgA.height });
  const mismatched = pixelmatch(imgA.data, imgB.data, out.data, imgA.width, imgA.height, {
    threshold,
    includeAA: false
  });
  const ratio = mismatched / (imgA.width * imgA.height);
  return {
    ok: ratio <= SCREENSHOT_MAX_RATIO,
    mismatched,
    ratio,
    width: imgA.width,
    height: imgA.height,
    diffPng: PNG.sync.write(out)
  };
}

export async function captureViewport(page) {
  const client = await attachCdp(page);
  await pauseAnimations(client);
  await page.evaluate(() => {
    const g = window.__ADR_GAME;
    if (g) {
      g._verifyFreeze = true;
      if (g.state && g.state.fire > 1) g.state.fire = 1;
    }
  }).catch(() => {});
  await page.waitForTimeout(120);
  return page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide" });
}

export async function runScreenshotDiff({ browser, url, styles, widths, outDir, updateBaselines }) {
  const suite = emptySuite("screenshot-diff");
  const ownBrowser = !browser;
  if (!browser) browser = await launchBrowser();
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.mkdirSync(path.join(outDir, "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "diffs"), { recursive: true });

  try {
    for (const style of styles) {
      for (const w of widths) {
        const vp = VIEWPORTS[w] || { width: w, height: 800 };
        const target = targetUrl(url, { style, fresh: true });
        const opened = await openPage(browser, { viewport: vp, url: target, style, fresh: true });
        const { page, context } = opened;
        const id = `${style}-${w}`;
        try {
          await realClick(page, "#room-btns button[data-key='fire'], button.adr");
          await page.waitForTimeout(250);
          await seedPlayState(page, { fire: 1, stores: { wood: 12 } });
          const png = await captureViewport(page);
          const currentPath = path.join(outDir, "screenshots", `${id}.png`);
          fs.writeFileSync(currentPath, png);
          const basePath = path.join(BASELINE_DIR, baselineName(style, w));
          if (updateBaselines) {
            fs.writeFileSync(basePath, png);
            ok(suite, { id: `${id}:update`, kind: "baseline", detail: `wrote ${path.relative(VERIFY_ROOT, basePath)}` });
            continue;
          }
          if (!fs.existsSync(basePath)) {
            fail(suite, {
              id: `${id}:missing-baseline`,
              kind: "baseline",
              detail: `missing ${path.relative(VERIFY_ROOT, basePath)}; run node tools/verify/screenshot-diff.mjs --update`
            });
            continue;
          }
          const baseline = fs.readFileSync(basePath);
          const d = diffPng(baseline, png, SCREENSHOT_THRESHOLD);
          if (!d.ok) {
            const diffPath = path.join(outDir, "diffs", `${id}.png`);
            if (d.diffPng) fs.writeFileSync(diffPath, d.diffPng);
            fail(suite, {
              id: `${id}:diff`,
              kind: "screenshot-diff",
              detail: d.reason
                ? d.reason
                : `${d.mismatched} px (${(d.ratio * 100).toFixed(3)}%) exceed max ${(SCREENSHOT_MAX_RATIO * 100).toFixed(2)}%`,
              mismatched: d.mismatched,
              ratio: d.ratio,
              current: currentPath,
              baseline: basePath,
              diff: d.diffPng ? diffPath : null
            });
          } else {
            ok(suite, {
              id: `${id}:diff`,
              kind: "screenshot-diff",
              mismatched: d.mismatched,
              ratio: d.ratio
            });
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    if (ownBrowser) await browser.close();
  }
  return suite;
}

const invoked = process.argv[1] && process.argv[1].endsWith("screenshot-diff.mjs");
if (invoked) {
  const { parseArgs } = await import("./lib/config.mjs");
  const { summarize, printHuman } = await import("./lib/report.mjs");
  const args = parseArgs();
  const suite = await runScreenshotDiff(args);
  const summary = summarize([suite], { url: args.url, updateBaselines: args.updateBaselines });
  printHuman(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.exitCode);
}
