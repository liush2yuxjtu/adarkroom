#!/usr/bin/env node
/**
 * Step 7 — CDP layout metrics. No page-JS DOM queries for measurements.
 * Uses Page.getLayoutMetrics, DOMSnapshot.captureSnapshot, DOM.getBoxModel.
 */
import { emptySuite, fail, ok, warn } from "./lib/report.mjs";
import {
  VIEWPORTS,
  TOOLBAR_SELECTORS,
  targetUrl
} from "./lib/config.mjs";
import { launchBrowser, openPage, realClick, seedPlayState, classifyNetwork } from "./lib/browser.mjs";
import {
  attachCdp,
  layoutMetrics,
  captureSnapshot,
  parseSnapshot,
  queryBox,
  queryAllBoxes,
  toolbarBoxes,
  getDocumentRoot
} from "./lib/cdp.mjs";
import { intersects, overflowX, clippedX, outsideViewport, overlapArea, overlapRect, roundRect } from "./lib/geometry.mjs";

const NOTE_TEXT_RE = /px-note-text|note-text/;

function visible(box) {
  return !!(box && box.w >= 1 && box.h >= 1);
}

function occlusionFinding(prefix, kind, aName, bName, a, b) {
  const ov = overlapArea(a, b);
  return {
    id: `${prefix}:occlude:${kind}:${aName}×${bName}`,
    kind: "occlusion",
    region: kind,
    a: aName,
    b: bName,
    overlapPx: Math.round(ov),
    aBox: roundRect(a),
    bBox: roundRect(b),
    style: prefix.split("@")[0],
    width: Number(prefix.split("@")[1]) || undefined,
    detail: `${aName} overlaps ${bName} by ${Math.round(ov)}px²`
  };
}

export async function runCdpLayout({ browser, url, styles, widths, outDir }) {
  const suite = emptySuite("cdp-layout");
  const ownBrowser = !browser;
  if (!browser) browser = await launchBrowser();

  try {
    for (const style of styles) {
      for (const w of widths) {
        const vp = VIEWPORTS[w] || { width: w, height: 800 };
        const target = targetUrl(url, { style, fresh: true });
        const opened = await openPage(browser, { viewport: vp, url: target, style, fresh: true });
        const { page, context, failed, posts, pageErrors } = opened;
        try {
          await realClick(page, "#room-btns button[data-key='fire'], button.adr");
          await page.waitForTimeout(300);
          await seedPlayState(page);

          const client = await attachCdp(page);
          const metrics = await layoutMetrics(client);
          const snap = parseSnapshot(await captureSnapshot(client));
          const rootId = await getDocumentRoot(client);
          const toolbar = await toolbarBoxes(client);
          const menu = toolbar["#menu"];
          const btnStyle = toolbar["#btn-style"];
          const notesHost = await queryBox(client, "#notifications", rootId);
          const noteCards = await queryAllBoxes(client, "#notifications .note");
          const sceneHost = await queryBox(client, ".px-scene-host", rootId);
          const scene = await queryBox(client, ".px-scene", rootId);
          const stores = await queryBox(client, "#stores", rootId);
          const panel = await queryBox(client, ".panel.active", rootId);

          const vw = metrics.viewport.width;
          const vh = metrics.viewport.height;
          const prefix = `${style}@${w}`;

          ok(suite, {
            id: `${prefix}:metrics`,
            kind: "metrics",
            viewport: metrics.viewport,
            contentSize: metrics.contentSize,
            scrollRange: metrics.scrollRange,
            snapshotNodes: snap.nodes.length
          });

          if (overflowX(metrics.contentSize.width, vw)) {
            fail(suite, {
              id: `${prefix}:overflow-x`,
              kind: "overflow",
              detail: `contentWidth ${metrics.contentSize.width} > viewport ${vw}`,
              style,
              width: w
            });
          } else {
            ok(suite, { id: `${prefix}:overflow-x`, kind: "overflow", detail: "none" });
          }

          if (metrics.scrollRange.x > 1) {
            fail(suite, {
              id: `${prefix}:scroll-x`,
              kind: "overflow",
              detail: `horizontal scroll range ${metrics.scrollRange.x}`,
              style,
              width: w
            });
          }

          if (!visible(btnStyle.box)) {
            fail(suite, {
              id: `${prefix}:btn-style-missing`,
              kind: "toolbar",
              detail: "#btn-style has no box model",
              style,
              width: w
            });
          } else {
            ok(suite, {
              id: `${prefix}:btn-style`,
              kind: "toolbar",
              box: roundRect(btnStyle.box)
            });
          }

          const menuBox = menu.box;
          const sceneBox = (sceneHost.box && visible(sceneHost.box) ? sceneHost.box : scene.box);
          const storesBox =
            stores.box && visible(stores.box) && stores.model ? stores.box : null;
          const notesBox = notesHost.box;

          if (visible(menuBox) && visible(sceneBox) && intersects(menuBox, sceneBox, 8)) {
            fail(suite, occlusionFinding(prefix, "toolbar-scene", "#menu", ".px-scene", menuBox, sceneBox));
          } else {
            ok(suite, { id: `${prefix}:toolbar-scene`, kind: "occlusion", detail: "clear" });
          }

          const overlappingNotes = [];
          for (const card of noteCards) {
            if (!visible(card.box)) continue;
            const visibleCard = notesBox ? overlapRect(card.box, notesBox) : card.box;
            if (!visible(visibleCard)) continue;
            if (visible(menuBox) && intersects(menuBox, visibleCard, 8)) {
              overlappingNotes.push(roundRect(visibleCard));
            }
            if (clippedX(card.box)) {
              fail(suite, {
                id: `${prefix}:note-clip-x`,
                kind: "clip",
                detail: `note card x=${card.box.x}`,
                box: roundRect(card.box),
                style,
                width: w
              });
            }
          }
          if (overlappingNotes.length) {
            fail(suite, {
              id: `${prefix}:toolbar-notes`,
              kind: "occlusion",
              detail: `#menu overlaps ${overlappingNotes.length} notification card(s) (incl. #btn-style in toolbar)`,
              cards: overlappingNotes,
              menu: roundRect(menuBox),
              btnStyle: roundRect(btnStyle.box),
              style,
              width: w
            });
          } else {
            ok(suite, { id: `${prefix}:toolbar-notes`, kind: "occlusion", detail: "clear" });
          }

          if (visible(menuBox) && visible(storesBox) && intersects(menuBox, storesBox, 8)) {
            fail(suite, occlusionFinding(prefix, "toolbar-stores", "#menu", "#stores", menuBox, storesBox));
          } else {
            ok(suite, { id: `${prefix}:toolbar-stores`, kind: "occlusion", detail: "clear" });
          }

          if (visible(sceneBox) && visible(storesBox) && intersects(sceneBox, storesBox, 8)) {
            fail(suite, occlusionFinding(prefix, "scene-stores", ".px-scene", "#stores", sceneBox, storesBox));
          } else {
            ok(suite, { id: `${prefix}:scene-stores`, kind: "occlusion", detail: "clear" });
          }

          if (visible(sceneBox) && visible(notesBox) && intersects(sceneBox, notesBox, 8)) {
            fail(suite, occlusionFinding(prefix, "scene-notes", ".px-scene", "#notifications", sceneBox, notesBox));
          } else {
            ok(suite, { id: `${prefix}:scene-notes`, kind: "occlusion", detail: "clear" });
          }

          const clipCandidates = [
            { name: "#menu", box: menuBox },
            { name: "#btn-style", box: btnStyle.box },
            { name: "#notifications", box: notesBox },
            { name: ".px-scene-host", box: sceneBox },
            { name: "#stores", box: storesBox },
            { name: ".panel.active", box: panel.box }
          ];
          for (const c of clipCandidates) {
            if (!visible(c.box)) continue;
            if (clippedX(c.box) || (c.name === ".px-scene-host" && c.box.x < -1)) {
              fail(suite, {
                id: `${prefix}:clip-x:${c.name}`,
                kind: "clip",
                detail: `${c.name} x=${c.box.x}`,
                box: roundRect(c.box),
                style,
                width: w
              });
            }
          }

          const appBox = await queryBox(client, "#app", rootId);
          if (appBox.box && appBox.box.w > vw + 1) {
            fail(suite, {
              id: `${prefix}:app-overflow`,
              kind: "overflow",
              detail: `#app content width ${Math.round(appBox.box.w)} > viewport ${vw} (overflow hidden cuts both edges)`,
              box: roundRect(appBox.box),
              style,
              width: w
            });
          }

          if (visible(notesBox) && notesBox.y >= vh - 4) {
            fail(suite, {
              id: `${prefix}:notes-below-fold`,
              kind: "clip",
              detail: `#notifications y=${Math.round(notesBox.y)} is below the fold (vh=${vh})`,
              box: roundRect(notesBox),
              style,
              width: w
            });
          }
          const firstVisibleNote = noteCards.find((c) => visible(c.box));
          if (style === "pixel" && visible(notesBox) && firstVisibleNote && firstVisibleNote.box.y > notesBox.y + notesBox.h + 4) {
            fail(suite, {
              id: `${prefix}:notes-scrolled-out`,
              kind: "clip",
              detail: `first note card y=${Math.round(firstVisibleNote.box.y)} is below #notifications box (y=${Math.round(notesBox.y)} h=${Math.round(notesBox.h)})`,
              card: roundRect(firstVisibleNote.box),
              host: roundRect(notesBox),
              style,
              width: w
            });
          }

          const toolbarBtns = ["#btn-style", "#btn-hyper", "#btn-settings", "#btn-export", "#btn-restart", "#btn-classic"]
            .map((sel) => ({ sel, box: toolbar[sel] && toolbar[sel].box }))
            .filter((b) => visible(b.box));
          if (toolbarBtns.length >= 2) {
            const ys = toolbarBtns.map((b) => Math.round(b.box.y / 8) * 8);
            const last = toolbarBtns.find((b) => b.sel === "#btn-classic");
            if (last) {
              const lastBand = Math.round(last.box.y / 8) * 8;
              const same = toolbarBtns.filter((b) => Math.round(b.box.y / 8) * 8 === lastBand);
              if (same.length === 1 && new Set(ys).size > 1) {
                fail(suite, {
                  id: `${prefix}:toolbar-wrap`,
                  kind: "align",
                  detail: "'原版' (#btn-classic) sits alone on a wrapped toolbar row",
                  ys: toolbarBtns.map((b) => ({ sel: b.sel, y: Math.round(b.box.y) })),
                  style,
                  width: w
                });
              }
            }
          }

          const header = await queryBox(client, "#header", rootId);
          const headerBtns = await queryAllBoxes(client, "#header button");
          for (const hb of headerBtns) {
            if (!visible(hb.box) || !hb.model) continue;
            const contentH = hb.model.height || hb.box.h;
            const visH = hb.box.h;
            if (style === "text" && contentH > visH + 4) {
              fail(suite, {
                id: `${prefix}:tab-clip-y`,
                kind: "clip",
                detail: `text tab content ${Math.round(contentH)} vs visible ${Math.round(visH)}`,
                box: roundRect(hb.box),
                style,
                width: w
              });
            }
          }
          if (style === "text" && visible(header.box) && header.box.h > 8 && header.box.h < 32) {
            fail(suite, {
              id: `${prefix}:tabbar-clip-y`,
              kind: "clip",
              detail: `#header visible height ${Math.round(header.box.h)} clips tab content`,
              box: roundRect(header.box),
              style,
              width: w
            });
          }

          if (style === "pixel") {
            const legend = await queryBox(client, ".px-notes-legend", rootId);
            const firstCard = noteCards.find((c) => visible(c.box));
            if (visible(legend.box) && firstCard) {
              const legendNotFullRow = legend.box.w < 80;
              const misaligned = Math.abs(legend.box.y - firstCard.box.y) > 12 && legendNotFullRow;
              if (misaligned) {
                fail(suite, {
                  id: `${prefix}:legend-align`,
                  kind: "align",
                  detail: `'消息' legend y=${legend.box.y} vs first card y=${firstCard.box.y}`,
                  legend: roundRect(legend.box),
                  card: roundRect(firstCard.box),
                  style,
                  width: w
                });
              }
            }
            const noteTexts = await queryAllBoxes(client, "#notifications .px-note-text, #notifications .note-text");
            const withBody = noteTexts.filter((n) => visible(n.box) && n.box.h >= 8 && n.box.w >= 40);
            if (noteCards.filter((c) => visible(c.box)).length && withBody.length === 0) {
              fail(suite, {
                id: `${prefix}:note-text-missing`,
                kind: "clip",
                detail: "pixel notification cards have no measurable full-text box (only icon/category glyph)",
                style,
                width: w
              });
            }
            for (const card of noteCards) {
              if (!visible(card.box) || !card.model) continue;
              const visW = card.box.w;
              const kids = await queryAllBoxes(client, "#notifications .note .px-note-text, #notifications .note .px-caption");
              for (const kid of kids) {
                if (!visible(kid.box)) continue;
                if (kid.box.w > visW + 8 && visW > 0 && visW < 90) {
                  fail(suite, {
                    id: `${prefix}:note-content-clip`,
                    kind: "clip",
                    detail: `note content width ${Math.round(kid.box.w)} vs visible ${Math.round(visW)} — only one character shows`,
                    style,
                    width: w
                  });
                  break;
                }
              }
            }
          }

          const cd = await queryAllBoxes(client, "button.adr .cd-sec");
          for (const badge of cd) {
            if (!visible(badge.box)) continue;
            const node = snap.nodes.find((n) => n.className && n.className.includes("cd-sec") && n.bounds);
            const fs = node && node.styles["font-size"];
            const px = fs ? parseFloat(fs) : badge.box.h;
            if (w >= 1024 && px > 0 && px < 12) {
              fail(suite, {
                id: `${prefix}:cd-sec-size`,
                kind: "clip",
                detail: `cooldown badge font-size ${fs || px + "px box"} on desktop`,
                style,
                width: w
              });
            }
          }

          const net = classifyNetwork(failed, posts);
          if (pageErrors.length) {
            fail(suite, {
              id: `${prefix}:uncaught`,
              kind: "error",
              detail: pageErrors.slice(0, 5).join(" | "),
              style,
              width: w
            });
          }
          if (net.realFailures.length) {
            warn(suite, {
              id: `${prefix}:network`,
              kind: "network",
              detail: `${net.realFailures.length} unpaired requestfailed`,
              samples: net.realFailures.slice(0, 3)
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

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1] && process.argv[1].endsWith("cdp-layout.mjs");
if (isMain && process.argv[1] && process.argv[1].includes("cdp-layout")) {
  const { parseArgs } = await import("./lib/config.mjs");
  const { summarize, printHuman, writeJson } = await import("./lib/report.mjs");
  const args = parseArgs();
  const suite = await runCdpLayout(args);
  const summary = summarize([suite], { url: args.url });
  printHuman(summary);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.exitCode);
}
