#!/usr/bin/env node
/**
 * Step 9 — Accessibility: axe-core, WCAG contrast, tap targets, names, Tab focus.
 * Tap-target boxes come from CDP DOM.getBoxModel. #btn-style is always included.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { emptySuite, fail, ok, warn } from "./lib/report.mjs";
import {
  VIEWPORTS,
  CONTRAST_NORMAL,
  CONTRAST_LARGE,
  tapMin,
  targetUrl,
  VERIFY_ROOT
} from "./lib/config.mjs";
import { launchBrowser, openPage, realClick, seedPlayState } from "./lib/browser.mjs";
import {
  attachCdp,
  captureSnapshot,
  parseSnapshot,
  queryBox,
  queryAllBoxes,
  computedForNode,
  getDocumentRoot,
  contrastRatio,
  fontPx,
  isLargeText,
  visibleTextNodes,
  contrastBackground
} from "./lib/cdp.mjs";
import { roundRect } from "./lib/geometry.mjs";

const require = createRequire(import.meta.url);

function axeSource() {
  const candidates = [
    path.join(VERIFY_ROOT, "node_modules/axe-core/axe.min.js"),
    require.resolve("axe-core/axe.min.js")
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch (e) { /* next */ }
  }
  throw new Error("axe-core not installed; run npm install in tools/verify");
}

function skipContrastNode(n) {
  if (!n.name || n.name.startsWith("#")) return true;
  if ((n.className || "").split(/\s+/).includes("px-icon")) return true;
  const fsPx = fontPx(n.styles["font-size"]);
  if (fsPx < 8) return true;
  const color = n.styles.color || "";
  if (!color || color === "transparent") return true;
  if (/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0/.test(color)) return true;
  const display = n.styles.display || "";
  const vis = n.styles.visibility || "";
  if (display === "none" || vis === "hidden") return true;
  if (n.styles.opacity === "0") return true;
  if (!n.bounds || n.bounds.w < 2 || n.bounds.h < 2) return true;
  return false;
}

function accessibleName(node, attrs) {
  const a = attrs || node.attrs || {};
  const aria = a["aria-label"] || node.ariaLabel || "";
  if (aria.trim()) return aria.trim();
  if ((a.title || node.title || "").trim()) return (a.title || node.title).trim();
  if ((a.alt || "").trim()) return a.alt.trim();
  return "";
}

export async function runA11y({ browser, url, styles, widths }) {
  const suite = emptySuite("a11y");
  const ownBrowser = !browser;
  if (!browser) browser = await launchBrowser();
  const axeJs = axeSource();

  try {
    for (const style of styles) {
      for (const w of widths) {
        const vp = VIEWPORTS[w] || { width: w, height: 800 };
        const minTap = tapMin(w);
        const target = targetUrl(url, { style, fresh: true });
        const opened = await openPage(browser, { viewport: vp, url: target, style, fresh: true });
        const { page, context } = opened;
        const prefix = `${style}@${w}`;
        try {
          await realClick(page, "#room-btns button[data-key='fire'], button.adr");
          await page.waitForTimeout(250);
          await seedPlayState(page);

          const client = await attachCdp(page);
          const snap = parseSnapshot(await captureSnapshot(client));
          const rootId = await getDocumentRoot(client);

          const axeResult = await page.evaluate(async (src) => {
            if (!window.axe) {
              // eslint-disable-next-line no-eval
              eval(src);
            }
            return window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
              }
            });
          }, axeJs);

          const axeFails = (axeResult.violations || []).flatMap((v) =>
            (v.nodes || []).slice(0, 8).map((n) => ({
              rule: v.id,
              impact: v.impact,
              html: (n.html || "").slice(0, 160),
              failure: (n.failureSummary || "").slice(0, 240)
            }))
          );
          const serious = axeFails.filter((v) => v.impact === "critical" || v.impact === "serious");
          const directorAria = axeFails.filter(
            (v) => /director-label/.test(v.html) && /aria/.test(`${v.rule} ${v.failure}`)
          );
          if (directorAria.length) {
            fail(suite, {
              id: `${prefix}:axe-director-aria`,
              kind: "axe",
              detail: "#director-label uses a disallowed aria attribute",
              samples: directorAria.slice(0, 3)
            });
          }
          const landmark = axeFails.filter((v) => v.rule === "landmark-one-main" || v.rule === "page-has-heading-one");
          if (landmark.length) {
            fail(suite, {
              id: `${prefix}:axe-landmark`,
              kind: "axe",
              detail: landmark.map((v) => v.rule).join(", "),
              samples: landmark.slice(0, 4)
            });
          }
          if (serious.length) {
            fail(suite, {
              id: `${prefix}:axe`,
              kind: "axe",
              detail: `${serious.length} serious/critical axe violations`,
              samples: serious.slice(0, 6)
            });
          } else {
            ok(suite, { id: `${prefix}:axe`, kind: "axe", detail: `${(axeResult.violations || []).length} non-serious` });
          }

          const dirNode = await queryBox(client, "#director-label", rootId);
          if (dirNode.nodeId) {
            const desc = await client.send("DOM.describeNode", { nodeId: dirNode.nodeId }).catch(() => null);
            const attrs = {};
            const list = desc && desc.node && desc.node.attributes;
            if (list) {
              for (let i = 0; i + 1 < list.length; i += 2) attrs[list[i]] = list[i + 1];
            }
            const role = attrs.role || "";
            if (attrs["aria-label"] && !role) {
              fail(suite, {
                id: `${prefix}:director-aria`,
                kind: "axe",
                detail: "#director-label has aria-label on a generic span (disallowed without role)",
                style,
                width: w
              });
            }
            const cs = await computedForNode(client, dirNode.nodeId).catch(() => ({}));
            const ratio = contrastRatio(cs.color, cs["background-color"]);
            if (ratio != null && ratio < 3) {
              fail(suite, {
                id: `${prefix}:director-contrast`,
                kind: "contrast",
                detail: `#director-label contrast ${ratio.toFixed(2)}:1 (fg ${cs.color} bg ${cs["background-color"]})`,
                ratio,
                style,
                width: w
              });
            }
          }

          for (const n of visibleTextNodes(snap)) {
            if (skipContrastNode(n)) continue;
            const bgUse = contrastBackground(n, snap);
            const ratio = contrastRatio(n.styles.color, bgUse);
            if (ratio == null) continue;
            const need = isLargeText(n.styles) ? CONTRAST_LARGE : CONTRAST_NORMAL;
            if (ratio + 0.01 < need) {
              const label = n.id || n.className || n.name;
              fail(suite, {
                id: `${prefix}:contrast:${label}`,
                kind: "contrast",
                detail: `${label} contrast ${ratio.toFixed(2)}:1 < ${need}:1 (font ${n.styles["font-size"]})`,
                fg: n.styles.color,
                bg: bgUse,
                ratio,
                need,
                style,
                width: w
              });
            }
          }

          const tapSelector =
            "button, [role=button], a, input, select, #btn-style, #btn-hyper, #btn-settings, #btn-export, #btn-restart, #btn-classic";
          const tapBoxes = await queryAllBoxes(client, tapSelector);
          const seen = new Set();
          let btnStyleChecked = false;
          for (const item of tapBoxes) {
            if (!item.box || item.box.w < 1 || item.box.h < 1) continue;
            const id = (item.attrs && item.attrs.id) || "";
            const key = `${id}|${Math.round(item.box.x)}|${Math.round(item.box.y)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (id === "btn-style") btnStyleChecked = true;
            const display = await computedForNode(client, item.nodeId).catch(() => ({}));
            if (display.display === "none" || display.visibility === "hidden") continue;
            if (item.box.w + 0.5 < minTap || item.box.h + 0.5 < minTap) {
              fail(suite, {
                id: `${prefix}:tap:${id || item.nodeName}`,
                kind: "tap-target",
                detail: `${id || item.nodeName} ${Math.round(item.box.w)}×${Math.round(item.box.h)} < ${minTap}px`,
                box: roundRect(item.box),
                min: minTap,
                style,
                width: w
              });
            }
          }
          const styleBtn = await queryBox(client, "#btn-style", rootId);
          if (!styleBtn.box) {
            fail(suite, {
              id: `${prefix}:tap:btn-style-missing`,
              kind: "tap-target",
              detail: "#btn-style missing from toolbar tap-target check",
              style,
              width: w
            });
          } else if (!btnStyleChecked) {
            if (styleBtn.box.w + 0.5 < minTap || styleBtn.box.h + 0.5 < minTap) {
              fail(suite, {
                id: `${prefix}:tap:btn-style`,
                kind: "tap-target",
                detail: `#btn-style ${Math.round(styleBtn.box.w)}×${Math.round(styleBtn.box.h)} < ${minTap}px`,
                box: roundRect(styleBtn.box),
                min: minTap
              });
            } else {
              ok(suite, { id: `${prefix}:tap:btn-style`, kind: "tap-target", box: roundRect(styleBtn.box) });
            }
          } else {
            ok(suite, { id: `${prefix}:tap:btn-style`, kind: "tap-target", box: roundRect(styleBtn.box) });
          }

          const namedSel = "button, [role=button], a, input, select, #btn-style";
          const named = await queryAllBoxes(client, namedSel);
          for (const item of named) {
            if (!item.box || item.box.w < 1) continue;
            const attrs = item.attrs || {};
            if ((attrs["aria-hidden"] || "") === "true") continue;
            const name = accessibleName(item, attrs);
            const hasTextChild = false;
            if (!name) {
              const desc = `${attrs.id || item.nodeName || "control"}`;
              if (desc === "BUTTON" || attrs.id) {
                const cs = await computedForNode(client, item.nodeId).catch(() => ({}));
                if (cs.display === "none") continue;
              }
              if (!name && !attrs.id && item.nodeName === "A" && !attrs.href) continue;
              if (!name) {
                fail(suite, {
                  id: `${prefix}:name:${attrs.id || item.nodeName}`,
                  kind: "accessible-name",
                  detail: `${attrs.id || item.nodeName} has no aria-label/title/alt`,
                  style,
                  width: w
                });
              }
            }
          }

          await page.evaluate(() => document.body && document.body.focus());
          const focused = [];
          for (let i = 0; i < 14; i++) {
            await page.keyboard.press("Tab");
            const info = await client.send("Runtime.evaluate", {
              expression:
                `(() => { const el = document.activeElement; if (!el || el === document.body) return null; return { tag: el.tagName, id: el.id || '', className: el.className || '', outline: getComputedStyle(el).outline, outlineWidth: getComputedStyle(el).outlineWidth, outlineStyle: getComputedStyle(el).outlineStyle, boxShadow: getComputedStyle(el).boxShadow, outlineOffset: getComputedStyle(el).outlineOffset }; })()`,
              returnByValue: true
            });
            const val = info.result && info.result.value;
            if (!val) continue;
            const key = val.id || `${val.tag}:${i}`;
            if (focused.some((f) => f.id === val.id && val.id)) continue;
            focused.push(val);
            const width = parseFloat(val.outlineWidth) || 0;
            const styleNone = !val.outlineStyle || val.outlineStyle === "none";
            const shadowNone = !val.boxShadow || val.boxShadow === "none";
            if (styleNone && shadowNone && width < 1) {
              fail(suite, {
                id: `${prefix}:focus:${key}`,
                kind: "focus-visible",
                detail: `Tab focus on ${key} has no outline/box-shadow`,
                style,
                width: w
              });
            }
          }
          if (!focused.length) {
            warn(suite, { id: `${prefix}:focus:none`, kind: "focus-visible", detail: "Tab did not land on a control" });
          } else {
            ok(suite, { id: `${prefix}:focus-count`, kind: "focus-visible", detail: `${focused.length} focused` });
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

const invoked = process.argv[1] && process.argv[1].endsWith("a11y.mjs");
if (invoked) {
  const { parseArgs } = await import("./lib/config.mjs");
  const { summarize, printHuman } = await import("./lib/report.mjs");
  const args = parseArgs();
  const suite = await runA11y(args);
  const summary = summarize([suite], { url: args.url });
  printHuman(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.exitCode);
}
