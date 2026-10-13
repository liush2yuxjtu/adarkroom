---
name: verify-adarkroom
description: "Verify the A Dark Room Chinese remake (web build godot/build/web + original game at /classic/) on its LIVE Vercel deployment: READY state, 200 (not 302) reachability, real-mouse 生火 click in headless Chromium, console/network errors, adr.telemetry, screenshots. Use whenever a change to this repo is claimed to work or has been deployed."
---

# Verify adarkroom (live Vercel deployment)

The surface users touch is the **deployed Vercel URL**: `/` serves the remake (`godot/build/web`, copied to `dist/` by `scripts/prepare-vercel.sh`) and `/classic/` serves the original game. Verification means driving that live URL with real input.

**Incident lesson (2026-10-12):** the remake was declared working after a local/VM headless run plus Vercel READY + curl 200. On the live site the buttons did nothing. A local or VM build test, READY state, or HTTP 200 does NOT verify the deployed site. Run Drive against the live URL, every time.

## Surfaces

Choose the recipe from [the surface index](references/verification-surfaces.md). A Vercel READY/200 PASS is not a playability, telemetry or classic PASS.

| Claim | Real surface | Required evidence |
| --- | --- | --- |
| Deployment is live for commit X | `vercel-live-deploy` | `get_deployment` READY + matching SHA, build log, doctor 200s with content-types |
| Remake is playable | `browser-remake` | Real-mouse `生火` → `#panel-room h1 == 生火间`, other buttons react, no console/4xx errors, CDP hit-test + listeners + node stability, `player_action` in localStorage, screenshot |
| Telemetry reaches the backend | `supabase-telemetry` | Rows in `playtest_events` for this run's `session_id` (via `execute_sql`), anon SELECT denied |
| Original game works | `classic-subpath` | Real-mouse `生火` → title `生火间`, screenshot |
| Early-game pacing is on-curve | `pacing-intent-check` | `python -m tools.pacing_analyzer --json` → `early_phase_slow` is false |
| New emits name the deployed build | `telemetry-event-version` (judgment skill) | `payload.client_version` present; analysis filters to current SHA |
| A retention/funnel number is a product fact | `pm-telemetry-human-filter` (judgment skill) | raw + human-only medians; automated/old/self-test excluded |
| A PM recommendation is actionable | `pm-recommendation-hygiene` (judgment skill) | each issue classified (a)/(b)/(c) with evidence; no (a)/(b) fix without that class |

## Launch

Nothing to launch locally. The target is a deployment:

1. Get the URL for the commit under test (PR preview or production) and confirm the deployment is ready: Vercel MCP `get_deployment` → `readyState == "READY"`, and its git SHA matches the candidate commit.
2. One-time harness setup on the box (PEP 668 blocks a system pip):
   ```bash
   python3 -m venv /workspace/.pwvenv && /workspace/.pwvenv/bin/pip install playwright && /workspace/.pwvenv/bin/python -m playwright install chromium
   ```
Teardown: none. The harness opens and closes its own browser.

## Doctor

```bash
.cursor/skills/verify-adarkroom/scripts/doctor.sh <base_url>
```
Every line must be `200`. `302` means Vercel Authentication protection is on: either disable `ssoProtection` on the project or use a protection bypass. A 404 on `engine.js`/`ui.js`/`data/*.json` means `dist/` was assembled wrong.

## Drive

```bash
/workspace/.pwvenv/bin/python .cursor/skills/verify-adarkroom/scripts/verify_live.py <base_url> /workspace/adr-verify   # browser-remake + classic-subpath
.cursor/skills/verify-adarkroom/scripts/cdp_inspect.sh <base_url>                                                      # browser-remake (CDP)
python3 -m tools.pacing_analyzer --json --input tools/testdata/playtest_events_sample.json                             # pacing-intent-check (every verify run)
```
Exit 0 means PASS, 1 means FAIL. Per-surface steps, pass criteria and the 2026-10-12 regression (buttons rebuilt every frame) are in `references/`. `pacing-intent-check` is on-demand only — no GitHub Action or cron.

## Evidence

Kept in `/workspace/adr-verify/` (survives cleanup): `live.png`, `classic.png`, `result.json`, `cdp.json` (URL, timestamp, HTTP status, before/after state, telemetry events, console errors, bad requests). Record the deployment URL, the commit SHA from `get_deployment`, and the timestamp in the report. Proof is the real click plus the changed state plus the telemetry side effect, not just a final screenshot.

## Cleanup

Nothing to kill. The harness closes its own Chromium. Do not delete `/workspace/adr-verify/`.

## Feature map

See `features/README.md`. Maintain with `/maintain-verification-skill`.
