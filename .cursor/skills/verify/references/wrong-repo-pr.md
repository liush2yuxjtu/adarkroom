# Surface `wrong-repo-pr`

Game-code and game-verification changes belong in `liush2yuxjtu/adarkroom`, not the `liush2yuxjtu/dot-pi` agent-framework backup (`~/.pi` settings, auth, sessions, and portable skills).

This surface is **not** `verification-scope-mismatch` (which implementation path is live inside one repo), **not** `pr-telemetry-required` (must the PR add events?), and **not** a substitute for playability or telemetry checks after the files are in the right place.

## Triggers

Run this surface when any of these hold:

- the PR or commit touches game code, game UI, game telemetry, or game verification (`godot/`, `godot/build/web`, `script/`, `lang/`, `supabase/`, `tools/pacing_analyzer.py`, `playtest_events`, live Vercel remake recipes)
- the PR description, worked examples, or file paths name A Dark Room / adarkroom / `godot/build/web` / `playtest_events` while the target repo is `dot-pi` (or any other non-game repo)
- a skill, doc, or analyzer was authored in the agent-framework repo so it could be copied into the game repo

Skip only when the change is truly agent-framework-owned (Pi settings, portable skill hashes for other skills, Feishu/CLI/server-api recipes that are not about this remake).

## Method

1. **Ownership.** Check that the PR's target repository matches content ownership.
   - Game code, remake export, playtest telemetry, pacing analyzer, and game verify recipes → `liush2yuxjtu/adarkroom`.
   - Pi home backup, portable skill inventory, Feishu/CLI/server-api references → `liush2yuxjtu/dot-pi`.
2. **Description and paths.** Check that the PR description and the file paths match the target repo's structure.
   - adarkroom expects `.cursor/skills/verify/`, `tools/pacing_analyzer.py` at repo root, `godot/build/web`, `supabase/migrations/`, `playtest_events`.
   - dot-pi expects `agent/skills/…`, `agent/skill-portability.json`, `.agents/skills/`.
   - A PR that writes `godot/build/web` or `tools/pacing_analyzer.py` into `dot-pi`, or that writes `agent/skill-portability.json` into adarkroom, fails this check.
3. **If wrong.** Do not merge the misplaced PR as the destination of record.
   - Copy/adapt the files into the right repo.
   - Open a replacement PR there (non-destructive PRs merge into adarkroom's live branch `cursor/godot-chinese-remake-5c3a`, never `main`).
   - Comment on the original PR with the new repo / PR / commit link, then close it.

## Output

| field | required content |
|---|---|
| target repo | owner/name of the PR under review |
| ownership verdict | game vs agent-framework, with the files that decided it |
| path/description match | yes/no plus the mismatched paths or wording |
| action | stay / migrate + comment + close |

## Pass / fail

- **PASS** — target repo matches content ownership, and the description plus file paths match that repo's structure.
- **FAIL** — game work is aimed at `dot-pi` (or agent-framework work is aimed at adarkroom); or paths/description do not match the target. Recovery is migrate + comment, not a silent merge.
- **SKIP** — the change is not a PR/commit about game code, game verification, or agent-framework ownership.

## Worked example: dot-pi PR #169

**Misplaced work.** [dot-pi PR #169](https://github.com/liush2yuxjtu/dot-pi/pull/169) (`cursor/verify-three-surfaces-863f`, HEAD `f2d76a7`) authored the verify judgment surfaces and the execution checklist (`agent/skills/verify/`: `SKILL.md`, `README.md`, `references/verification-surfaces.md`, `aesthetic-community-consensus.md`, `pr-telemetry-required.md`, `behavior-timeline-vs-mechanics.md`, `verification-scope-mismatch.md`, `pacing-intent-check.md`, `concrete-verification-steps.md`).

**Why it is game-owned.** The PR body says it is intended to be copied into `liush2yuxjtu/adarkroom`. Paths and worked examples are repo-local to this remake: `tools/pacing_analyzer.py` at repo root, live export `godot/build/web`, Supabase `playtest_events`, commit `5e3b891`, branch `cursor/godot-chinese-remake-5c3a`. The PR itself says **do not merge** it as the destination of record.

**Correct action.** Migrate those files (skip dot-pi-only `cli.md`, `server-api.md`, `feishu-native-cards.md`, `recent-project-patterns.md`) into this repo at `.cursor/skills/verify/`. Adapt paths. Open and merge an adarkroom PR into the live remake branch. Comment on dot-pi #169 with the new PR/commit and close it.
