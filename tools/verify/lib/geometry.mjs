export function rectFromQuad(quad) {
  if (!quad || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function rectFromBoxModel(model) {
  if (!model) return null;
  return rectFromQuad(model.border || model.padding || model.content);
}

export function rectFromBounds(bounds) {
  if (!bounds || bounds.length < 4) return null;
  return { x: bounds[0], y: bounds[1], w: bounds[2], h: bounds[3] };
}

export function area(r) {
  if (!r) return 0;
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function overlapRect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  if (r - x <= 0.5 || bot - y <= 0.5) return null;
  return { x, y, w: r - x, h: bot - y };
}

export function overlapArea(a, b) {
  return area(overlapRect(a, b));
}

export function intersects(a, b, minArea = 2) {
  return overlapArea(a, b) >= minArea;
}

export function containsPoint(r, x, y) {
  return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function outsideViewport(r, vw, vh, slop = 1) {
  if (!r || r.w < 1 || r.h < 1) return false;
  return r.x < -slop || r.y < -slop || r.x + r.w > vw + slop || r.y + r.h > vh + slop;
}

export function clippedX(r, slop = 0.5) {
  return !!(r && r.w > 0 && r.h > 0 && r.x < -slop);
}

export function overflowX(contentW, viewW, slop = 1) {
  return contentW > viewW + slop;
}

export function roundRect(r, n = 1) {
  if (!r) return null;
  const f = (v) => Number(v.toFixed(n));
  return { x: f(r.x), y: f(r.y), w: f(r.w), h: f(r.h) };
}
