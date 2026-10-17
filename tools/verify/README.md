# tools/verify

Runnable execution steps for `.cursor/skills/verify/` (steps 7–10). Not a judgment surface.

```bash
cd tools/verify && npm install
npx playwright install chromium   # if bundled chromium is missing
node run.mjs --url <preview-or-local>
node screenshot-diff.mjs --update --url <url>   # rewrite committed baselines
node run.mjs --only browser-ending              # just the real-browser run to the ending
```

**Low memory.** By default `run.mjs` runs each browser part (cdp, screenshots, a11y,
extremes, browser-ending) in its own child process with a fresh Chromium, one after
another, and the headless parts in one more child. Peak memory is one part's worth, so
the full suite finishes in one command on a box with ~2 GB free (a single process used
to die with `Page crashed` in extremes). Child logs: `<out>/logs/child-<part>.log`.
`--no-split` runs everything in one process (still a fresh browser per part).

| Script | What it measures |
|---|---|
| `cdp-layout.mjs` | CDP `Page.getLayoutMetrics`, `DOMSnapshot.captureSnapshot` (font-size, color, background-color, z-index, display, visibility), `DOM.getBoxModel`. Toolbar (incl. `#btn-style`) vs notes/scene/stores, overflow, clip, below-the-fold. |
| `screenshot-diff.mjs` | Viewport PNGs at 360, 390, 768, 1024, 1280, 1440, 1920 × pixel/text vs `baselines/`. |
| `a11y.mjs` | axe-core, WCAG contrast 4.5:1 / 3:1, tap targets 44px mobile / 24px desktop (incl. `#btn-style`), accessible names, Tab focus. |
| `extremes.mjs` | Long text, stores=0, 1e9, corrupt saves (invalid JSON, missing fields, wrong types). |
| `browser-ending.mjs` | Default suite. Real web game in headless Chromium (default: deployed playtest URL) from a fresh save to `#panel-ending`. Fire lit by a real click; the `playthrough.mjs` policy then runs inside the page on `window.__ADR_GAME` (same `game.act` calls as the buttons, 20× game speed, a test-only clock offset for cooldowns); ship → lift-off → space → ending is played live with real clicks (原速/加速, 点火起飞, warning modal) and a dodge autopilot. Seeded `Math.random` (7); telemetry POSTs answered locally. Screenshots + `browser-ending.json` in `<out>/browser-ending/`. ~75 s. |
| `telemetry.mjs` | Headless engine + telemetry.js with mocked sink: phase re-sync after load, failed actions reported, stuck detector, dedup/event_id, session_start first, `is_automation`, `client_version` on every event, cap keeps milestones, `save_snapshot`, `worker_assign`, `cured_meat_first`. No network. |
| `story.mjs` | Seeded headless playthrough of every phase to `slice_complete`; per-node trigger/actual table. Also lodge/smokehouse, charcutier, cured meat packed for embark. |
| `playthrough.mjs` | Default suite. Full run on the migrated world: landmarks `ironmine` / `coalmine` / `sulphurmine` / `ship` / `executioner`, flags `world_ironmine` / `world_coalmine` / `world_sulphurmine` / `world_ship` / `world_executioner`, ending `state.ending`, prestige via `restart`. |
| `classic-playthrough.mjs` | Same milestones timed from original JS constants (`script/room.js` / `outside.js` / `world.js`). |
| `onboarding.mjs` | New save shows the persistent goal line; it updates fire → forest; telemetry carries `client_version`. |
| `income.mjs` | Worker incomes over time (hunter/trapper/tanner/charcutier/miners/steelworker/armourer) against `script/outside.js` `_INCOME`. |
| `parity.mjs` | Original vs remake content table. Opt-in: `node tools/verify/run.mjs --only parity` (not in the default list while gaps remain). See `.cursor/skills/verify/references/content-parity.md`. |
| `migration.mjs` | Review gate: present + numeric + Chinese + persist + per-batch story. Opt-in: `node tools/verify/run.mjs --only migration`. Exit 0 = REVIEW PASS. Writes `reports/migration-baseline.{json,md}`. |

Stdout is JSON `{ pass, exitCode, failures, … }`. Exit 1 on any FAIL.
