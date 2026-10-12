# Agent instructions (adarkroom)

This is `liush2yuxjtu/adarkroom`, the A Dark Room Chinese remake. Live playable branch: `cursor/godot-chinese-remake-5c3a`. Remake export: `godot/build/web` (served at `/`). Original game: `/classic/`. Telemetry: Supabase `playtest_events`.

## Verify on every merge or task completion

On every PR merge or task completion, run the verify skill on demand (`.cursor/skills/verify/`). Choose the relevant judgment surfaces plus the matching concrete steps in `.cursor/skills/verify/references/concrete-verification-steps.md`. Operational live-deploy recipes (READY, real-mouse `生火`, classic, sink read-back) live in `.cursor/skills/verify-adarkroom/`.

The pacing analyzer runs automatically via `python -m tools.pacing_analyzer --json` if `tools/pacing_analyzer.py` is present. Offline fixture: `--input tools/testdata/playtest_events_sample.json`. This is not a GitHub Action, cron, or manual substitute. Read `early_phase_slow` / `ratio`. A slow early phase is an intent question (「这个慢节奏是有意设计的吗？」), never a bug.

## Vercel deploys

Only `main` and the live branch `cursor/godot-chinese-remake-5c3a` auto-deploy. Other branches do not. Agents deploy manually once when a preview is needed:

```
npx vercel deploy --scope nyn5255-8475s-projects
```

Rules: `vercel.json` `git.deploymentEnabled` and `scripts/vercel-ignore.sh`. Docs/tools-only commits on the auto-deploy refs also skip.

## Merge rule

Non-destructive PRs merge into the live branch `cursor/godot-chinese-remake-5c3a`, never `main`. Do not touch `main`.
