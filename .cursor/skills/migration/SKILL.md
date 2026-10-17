---
name: migration
description: "Review whether the original A Dark Room has been fully migrated into the Chinese remake. Use whenever the user asks if the remake is complete, to audit remaining original content, to accept a batch as done, or to run the migration gate (`--only migration`). Strict, repeatable review: original script/*.js + lang/zh_cn are the source of truth; nothing is an intentional cut."
---

# Migration review (original → Chinese remake)

This skill **reviews** completeness. It does not implement missing content. The gate is machine-checked plus a human walk. Exit code 0 is the only REVIEW PASS.

Live remake: `godot/build/web` (`engine.js`, `ui.js`, `events.json`). Original: repo-root `script/*.js`, Chinese keys in `lang/zh_cn/strings.js`.

## What "fully migrated" means

Read [references/definition.md](references/definition.md) before judging a batch. In short, every original content item must be:

1. **Present** — defined in the remake that actually ships (`godot/build/web`, not unused `.gd`).
2. **Numerically faithful** — costs, income rates, probabilities, damage, cooldowns match the original (n=0 and n=1 for scaling costs).
3. **Reachable** — something produces or unlocks it; the player can get there in play.
4. **Chinese** — `lang/zh_cn` has the string and the remake UI shows it.
5. **Persisted** — save/load (`adr.save.v1` + `hydrateState` / `migrateState`) keeps it.

Whitelist / allowlist stays **empty** unless a reviewer names one original entry and a reason. User rule: **nothing is cut**. Early slow pacing is **intentional** and must not be retuned.

## Machine gate

```bash
node tools/verify/run.mjs --only migration
# or
.cursor/skills/migration/scripts/review.sh
```

Exit **0** = REVIEW PASS. The engine is `tools/verify/parity.mjs` plus `tools/verify/migration.mjs`: it **auto-extracts** from `script/*.js` each run (no hand list). It writes `tools/verify/reports/migration-baseline.json` and `.md`.

PASS requires **all** of:

- 0 `missing`
- 0 `no_producer`
- 0 numeric `mismatch`
- every batch reachability / story run passes

`parity` remains opt-in (`--only parity`) and is a subset (present / no_producer / missing). Do not add `migration` to the default `run.mjs` list until it is green.

## Human walk

After the machine run, walk [references/review-checklist.md](references/review-checklist.md). Intentional deviations go only in `tools/verify/migration-allowlist.json` with a `reason`. Additions (director, telemetry, pixel style, `slice_complete`) are remake extras, not cuts — list them as additions, not allowlist.

## Batches

Batch 1 (village economy) is landed. Remaining gaps belong in batches 2–9. See [references/batches.md](references/batches.md).

| batch | scope |
|---|---|
| core | Early room/forest slice already shipping |
| 1 | Lodge–armoury, workers, leather, cured meat |
| 2 | Workshop crafts, water, bags, armour, crafted weapons |
| 3 | Trading-post buy menu |
| 4 | Room / outside / global / marketing events |
| 5 | Encounters, weapons, perks, world rules |
| 6 | Landmarks and setpieces |
| 7 | Ship and space |
| 8 | Fabricator and blueprints |
| 9 | Executioner, ending, prestige, score |

## Reviewer output

Always report: command + exit code, gate counts (`missing` / `no_producer` / `mismatch`), per-category counts, per-batch 2–9 gap list, allowlist (empty or cited), pacing (do not retune), and whether default verify suites still pass.

## Do not

- Treat a missing original row as "later / out of scope" without putting it on a numbered batch.
- Retune gather 60s / stoke 10s / builder 30s because the early game feels slow.
- Accept Godot `.gd` as the live path; Vercel serves `godot/build/web`.
- Add silent allowlist entries.
