# tools/verify

Runnable execution steps for `.cursor/skills/verify/` (steps 7–10). Not a judgment surface.

```bash
cd tools/verify && npm install
npx playwright install chromium   # if bundled chromium is missing
node run.mjs --url <preview-or-local>
node screenshot-diff.mjs --update --url <url>   # rewrite committed baselines
```

| Script | What it measures |
|---|---|
| `cdp-layout.mjs` | CDP `Page.getLayoutMetrics`, `DOMSnapshot.captureSnapshot` (font-size, color, background-color, z-index, display, visibility), `DOM.getBoxModel`. Toolbar (incl. `#btn-style`) vs notes/scene/stores, overflow, clip, below-the-fold. |
| `screenshot-diff.mjs` | Viewport PNGs at 360, 390, 768, 1024, 1280, 1440, 1920 × pixel/text vs `baselines/`. |
| `a11y.mjs` | axe-core, WCAG contrast 4.5:1 / 3:1, tap targets 44px mobile / 24px desktop (incl. `#btn-style`), accessible names, Tab focus. |
| `extremes.mjs` | Long text, stores=0, 1e9, corrupt saves (invalid JSON, missing fields, wrong types). |
| `telemetry.mjs` | Headless engine + telemetry.js with mocked sink: phase re-sync after load, failed actions reported, stuck detector, dedup/event_id, session_start first, `is_automation`, cap keeps milestones. No network. |
| `story.mjs` | Seeded headless playthrough of every phase to `slice_complete`; per-node trigger/actual table. |

Stdout is JSON `{ pass, exitCode, failures, … }`. Exit 1 on any FAIL.
