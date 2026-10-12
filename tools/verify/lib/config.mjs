import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const VERIFY_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(VERIFY_ROOT, "../..");

export const DEFAULT_URL =
  process.env.ADR_VERIFY_URL ||
  "https://adarkroom-zh-git-cursor-godot-chi-149f09-nyn5255-8475s-projects.vercel.app";

export const WIDTHS = [360, 390, 768, 1024, 1280, 1440, 1920];

export const VIEWPORTS = {
  360: { width: 360, height: 740 },
  390: { width: 390, height: 844 },
  768: { width: 768, height: 1024 },
  1024: { width: 1024, height: 768 },
  1280: { width: 1280, height: 800 },
  1440: { width: 1440, height: 900 },
  1920: { width: 1920, height: 1080 }
};

export const STYLES = ["pixel", "text"];

export const TOOLBAR_SELECTORS = [
  "#menu",
  "#btn-style",
  "#btn-hyper",
  "#btn-settings",
  "#btn-export",
  "#btn-restart",
  "#btn-classic",
  "#director-label"
];

export const SCENE_SELECTORS = [".px-scene-host", ".px-scene", ".panel.active"];
export const NOTES_SELECTORS = ["#notifications", "#notifications .note"];
export const STORES_SELECTORS = ["#stores"];

export const COMPUTED_STYLES = [
  "font-size",
  "color",
  "background-color",
  "z-index",
  "display",
  "visibility",
  "overflow",
  "overflow-x",
  "overflow-y",
  "opacity",
  "position",
  "outline-style",
  "outline-width",
  "outline-color",
  "box-shadow"
];

export const SCREENSHOT_THRESHOLD = Number(process.env.ADR_VERIFY_DIFF_THRESHOLD || 0.12);
export const SCREENSHOT_MAX_RATIO = Number(process.env.ADR_VERIFY_DIFF_RATIO || 0.015);

export const CONTRAST_NORMAL = 4.5;
export const CONTRAST_LARGE = 3;
export const TAP_MOBILE = 44;
export const TAP_DESKTOP = 24;
export const MOBILE_MAX_WIDTH = 768;

export function isMobileWidth(w) {
  return w <= MOBILE_MAX_WIDTH;
}

export function tapMin(w) {
  return isMobileWidth(w) ? TAP_MOBILE : TAP_DESKTOP;
}

export function withQuery(url, extra) {
  const u = new URL(url, "http://local");
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  return u.pathname === url && !url.startsWith("http")
    ? `${u.pathname}${u.search}${u.hash}`
    : u.toString();
}

export function targetUrl(base, { style, fresh = true } = {}) {
  const u = new URL(base);
  if (style) u.searchParams.set("style", style);
  if (fresh) u.searchParams.set("fresh", "1");
  else u.searchParams.delete("fresh");
  return u.toString();
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    url: DEFAULT_URL,
    styles: STYLES.slice(),
    widths: WIDTHS.slice(),
    outDir: path.join(VERIFY_ROOT, "artifacts"),
    updateBaselines: false,
    only: null,
    json: true
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--url" && next) {
      out.url = next;
      i++;
    } else if (a === "--styles" && next) {
      out.styles = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === "--widths" && next) {
      out.widths = next.split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
      i++;
    } else if (a === "--out" && next) {
      out.outDir = path.resolve(next);
      i++;
    } else if (a === "--update" || a === "--update-baselines") {
      out.updateBaselines = true;
    } else if (a === "--only" && next) {
      out.only = next.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === "--no-json") {
      out.json = false;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}
