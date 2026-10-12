import { COMPUTED_STYLES, TOOLBAR_SELECTORS } from "./config.mjs";
import { rectFromBoxModel, rectFromBounds, rectFromQuad, roundRect } from "./geometry.mjs";

export async function attachCdp(page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  await client.send("Overlay.enable").catch(() => {});
  await client.send("Runtime.enable");
  return client;
}

export async function pauseAnimations(client) {
  let frameId;
  try {
    const tree = await client.send("Page.getFrameTree");
    frameId = tree.frameTree && tree.frameTree.frame && tree.frameTree.frame.id;
  } catch (e) {
    frameId = null;
  }
  if (!frameId) return;
  const { styleSheetId } = await client.send("CSS.createStyleSheet", { frameId });
  await client.send("CSS.setStyleSheetText", {
    styleSheetId,
    text:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}"
  });
}

export async function layoutMetrics(client) {
  const m = await client.send("Page.getLayoutMetrics");
  const view = m.cssLayoutViewport || m.layoutViewport;
  const vis = m.cssVisualViewport || m.visualViewport;
  const content = m.cssContentSize || m.contentSize;
  return {
    viewport: {
      x: view.pageX || 0,
      y: view.pageY || 0,
      width: view.clientWidth,
      height: view.clientHeight
    },
    visual: {
      x: vis.pageX || 0,
      y: vis.pageY || 0,
      width: vis.clientWidth,
      height: vis.clientHeight,
      scale: vis.scale || 1
    },
    contentSize: { width: content.width, height: content.height },
    scrollRange: {
      x: Math.max(0, content.width - view.clientWidth),
      y: Math.max(0, content.height - view.clientHeight)
    }
  };
}

export async function captureSnapshot(client) {
  return client.send("DOMSnapshot.captureSnapshot", {
    computedStyles: COMPUTED_STYLES,
    includePaintOrder: true,
    includeDOMRects: true,
    includeBlendedBackgroundColors: true
  });
}

function str(strings, idx) {
  if (idx == null || idx < 0) return "";
  return strings[idx] || "";
}

function parseAttrs(strings, attrIdxs) {
  const out = {};
  if (!attrIdxs) return out;
  for (let i = 0; i + 1 < attrIdxs.length; i += 2) {
    out[str(strings, attrIdxs[i])] = str(strings, attrIdxs[i + 1]);
  }
  return out;
}

function parseStyle(strings, computedNames, styleIdxs) {
  const out = {};
  if (!styleIdxs) return out;
  computedNames.forEach((name, i) => {
    const idx = styleIdxs[i];
    if (idx != null && idx >= 0) out[name] = str(strings, idx);
  });
  return out;
}

export function parseSnapshot(snap) {
  const strings = snap.strings || [];
  const doc = (snap.documents && snap.documents[0]) || {};
  const nodes = doc.nodes || {};
  const layout = doc.layout || {};
  const textBoxes = doc.textBoxes || {};
  const names = nodes.nodeName || [];
  const attrs = nodes.attributes || [];
  const nodeCount = names.length;
  const layoutIndexByNode = new Map();
  (layout.nodeIndex || []).forEach((nodeIdx, li) => layoutIndexByNode.set(nodeIdx, li));

  const parsedNodes = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = parseAttrs(strings, attrs[i]);
    const li = layoutIndexByNode.get(i);
    const bounds = li == null ? null : rectFromBounds(layout.bounds && layout.bounds[li]);
    const client = li == null ? null : rectFromBounds(layout.clientRects && layout.clientRects[li]);
    const scroll = li == null ? null : rectFromBounds(layout.scrollRects && layout.scrollRects[li]);
    const styles = li == null ? {} : parseStyle(strings, COMPUTED_STYLES, layout.styles && layout.styles[li]);
    const parentIndex = nodes.parentIndex ? nodes.parentIndex[i] : -1;
    const blendedIdx = li == null ? -1 : (layout.blendedBackgroundColors && layout.blendedBackgroundColors[li]);
    parsedNodes.push({
      index: i,
      name: str(strings, names[i]).toLowerCase(),
      id: a.id || "",
      className: a.class || a.className || "",
      role: a.role || "",
      ariaLabel: a["aria-label"] || "",
      title: a.title || "",
      href: a.href || "",
      type: a.type || "",
      disabled: a.disabled != null && a.disabled !== "false",
      attrs: a,
      parentIndex,
      layoutIndex: li,
      bounds,
      client,
      scroll,
      styles,
      blendedBackground: blendedIdx == null || blendedIdx < 0 ? "" : str(strings, blendedIdx),
      paintOrder: li == null ? null : (layout.paintOrders && layout.paintOrders[li]) || 0,
      stacking: li == null ? null : (layout.stackingContexts && layout.stackingContexts[li]) || 0
    });
  }

  const texts = [];
  const layoutIndex = textBoxes.layoutIndex || [];
  const tBounds = textBoxes.bounds || [];
  const tStart = textBoxes.start || [];
  const tLen = textBoxes.length || [];
  for (let i = 0; i < layoutIndex.length; i++) {
    texts.push({
      layoutIndex: layoutIndex[i],
      bounds: rectFromBounds(tBounds[i]),
      start: tStart[i],
      length: tLen[i]
    });
  }

  return { strings, nodes: parsedNodes, texts, viewport: layout };
}

export function findNodes(parsed, pred) {
  return parsed.nodes.filter(pred);
}

export function findById(parsed, id) {
  return parsed.nodes.find((n) => n.id === id) || null;
}

export function findBySelectorHint(parsed, selector) {
  if (selector.startsWith("#") && !selector.includes(" ")) {
    return findById(parsed, selector.slice(1));
  }
  if (selector.includes(" ")) {
    const [parent, child] = selector.split(" ");
    const p = findBySelectorHint(parsed, parent);
    if (!p) return null;
    const kids = parsed.nodes.filter((n) => matchesSimple(n, child) && n.bounds && p.bounds);
    return kids[0] || null;
  }
  return parsed.nodes.find((n) => matchesSimple(n, selector)) || null;
}

function matchesSimple(n, sel) {
  if (sel.startsWith("#")) return n.id === sel.slice(1);
  if (sel.startsWith(".")) {
    const cls = sel.slice(1);
    return (` ${n.className} `).includes(` ${cls} `);
  }
  return n.name === sel.toLowerCase();
}

export async function getDocumentRoot(client) {
  const { root } = await client.send("DOM.getDocument", { depth: 0, pierce: true });
  return root.nodeId;
}

export async function queryBox(client, selector, rootId) {
  const tryQuery = async (nodeId) => {
    const res = await client.send("DOM.querySelector", { nodeId, selector });
    if (!res.nodeId) return { selector, nodeId: 0, box: null, model: null };
    try {
      const { model } = await client.send("DOM.getBoxModel", { nodeId: res.nodeId });
      return { selector, nodeId: res.nodeId, box: rectFromBoxModel(model), model };
    } catch (e) {
      return { selector, nodeId: res.nodeId, box: null, model: null, error: String(e.message || e) };
    }
  };
  try {
    return await tryQuery(rootId || (await getDocumentRoot(client)));
  } catch (e) {
    try {
      return await tryQuery(await getDocumentRoot(client));
    } catch (e2) {
      return { selector, nodeId: 0, box: null, model: null, error: String(e2.message || e2) };
    }
  }
}

export async function queryAllBoxes(client, selector) {
  await getDocumentRoot(client);
  const { searchId, resultCount } = await client.send("DOM.performSearch", {
    query: selector,
    includeUserAgentShadowDOM: false
  });
  const boxes = [];
  if (!resultCount) {
    await client.send("DOM.discardSearchResults", { searchId }).catch(() => {});
    return boxes;
  }
  const { nodeIds } = await client.send("DOM.getSearchResults", {
    searchId,
    fromIndex: 0,
    toIndex: resultCount
  });
  for (const nodeId of nodeIds) {
    try {
      const { model } = await client.send("DOM.getBoxModel", { nodeId });
      const desc = await client.send("DOM.describeNode", { nodeId }).catch(() => null);
      const node = desc && desc.node;
      const attrs = {};
      if (node && node.attributes) {
        for (let i = 0; i + 1 < node.attributes.length; i += 2) {
          attrs[node.attributes[i]] = node.attributes[i + 1];
        }
      }
      boxes.push({
        selector,
        nodeId,
        box: rectFromBoxModel(model),
        model,
        nodeName: node && node.nodeName,
        attrs
      });
    } catch (e) {
      boxes.push({ selector, nodeId, box: null, error: String(e.message || e) });
    }
  }
  await client.send("DOM.discardSearchResults", { searchId }).catch(() => {});
  return boxes;
}

export async function toolbarBoxes(client) {
  const out = {};
  for (const sel of TOOLBAR_SELECTORS) {
    out[sel] = await queryBox(client, sel);
  }
  return out;
}

export async function computedForNode(client, nodeId) {
  await client.send("CSS.enable");
  const { computedStyle } = await client.send("CSS.getComputedStyleForNode", { nodeId });
  const map = {};
  for (const e of computedStyle) map[e.name] = e.value;
  return map;
}

const PAPER_BG = "rgb(243, 241, 234)";
const DIRT_RGB = { r: 28, g: 22, b: 18 };

function isDirtWallpaper(rgb) {
  return rgb && Math.abs(rgb.r - DIRT_RGB.r) < 3 && Math.abs(rgb.g - DIRT_RGB.g) < 3 && Math.abs(rgb.b - DIRT_RGB.b) < 3;
}

export function opaqueColor(color) {
  const rgb = parseRgb(color);
  if (!rgb || rgb.a < 0.95) return null;
  return rgb;
}

/** Nearest opaque ancestor background. Never use the pixel dirt wallpaper for paper-backed captions. */
export function contrastBackground(node, parsed) {
  let cur = node;
  const seen = new Set();
  while (cur && !seen.has(cur.index)) {
    seen.add(cur.index);
    const own = opaqueColor(cur.styles && cur.styles["background-color"]);
    if (own) {
      if ((cur.name === "body" || cur.name === "html") && isDirtWallpaper(own)) {
        return PAPER_BG;
      }
      return cur.styles["background-color"];
    }
    if (cur.parentIndex == null || cur.parentIndex < 0) break;
    cur = parsed.nodes[cur.parentIndex];
  }
  const blended = opaqueColor(node.blendedBackground);
  if (blended && !isDirtWallpaper(blended)) return node.blendedBackground;
  return PAPER_BG;
}

export function visibleTextNodes(parsed) {
  return parsed.nodes.filter((n) => {
    if (!n.name || n.name.startsWith("#")) return false;
    if ((n.className || "").split(/\s+/).includes("px-icon")) return false;
    const fs = n.styles["font-size"];
    const color = n.styles.color || "";
    const display = n.styles.display || "";
    const vis = n.styles.visibility || "";
    if (display === "none" || vis === "hidden") return false;
    if (!n.bounds || n.bounds.w < 1 || n.bounds.h < 1) return false;
    if (fs === "0px" || fs === "0") return false;
    if (fontPx(fs) < 8) return false;
    if (!color || color === "transparent" || /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(\.0+)?\s*\)/.test(color)) {
      return false;
    }
    return true;
  });
}

export function parseRgb(color) {
  if (!color) return null;
  const m = String(color).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i);
  if (!m) return null;
  const a = m[4] == null ? 1 : Number(m[4]);
  if (a <= 0.01) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}

function srgb(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb) {
  if (!rgb) return null;
  return 0.2126 * srgb(rgb.r) + 0.7152 * srgb(rgb.g) + 0.0722 * srgb(rgb.b);
}

export function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(parseRgb(fg));
  const L2 = relativeLuminance(parseRgb(bg));
  if (L1 == null || L2 == null) return null;
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

export function fontPx(fs) {
  const n = parseFloat(fs);
  return Number.isFinite(n) ? n : 0;
}

export function isLargeText(styles) {
  const px = fontPx(styles["font-size"]);
  const weight = String(styles["font-weight"] || "");
  const bold = weight === "bold" || Number(weight) >= 700;
  return px >= 24 || (bold && px >= 18.66);
}

export { rectFromBoxModel, rectFromQuad, roundRect };
