# Telemetry contract + story progression checks

Runnable, headless, no network: `engine.js` (+ `telemetry.js`, `sinks/supabase.js`) is loaded into a
Node `vm` sandbox (`tools/verify/lib/engine-sandbox.mjs`) with a fake wall clock, in-memory
`localStorage`, a mocked sink, and optional seeded `Math.random`. Production Supabase is never written.

```bash
node tools/verify/telemetry.mjs          # headless checks, JSON, exit 1 on FAIL
node tools/verify/story.mjs --runs 5     # phase ladder to slice_complete, per-node table
node tools/verify/playthrough.mjs        # full ending+prestige, game-time + wall-clock per stage
node tools/verify/classic-playthrough.mjs
node tools/verify/run.mjs --only telemetry,story,onboarding,playthrough
```

`run.mjs` includes both suites by default (story with 3 seeded runs).

## Telemetry checks (`tools/verify/telemetry.mjs`)

| id | Bug it guards (found in `playtest_events`, 2026-10-12) | Pass condition |
|---|---|---|
| `phase-resync-after-load` | restored session logged `phase_time {"phase":"room_dark","seconds":4086.2}` | after a save load, the next `phase_time` names the restored phase with small seconds |
| `failed-action-reported` | `act()` returned errors before logging, so `player_action` never had ok/error | rejected action logs `player_action {ok:false,error}`; successes carry `ok:true` |
| `stuck-detector-fires` | 0 `stuck` rows ever: passive store income reset the timer and a 1.2s window was skipped by large ticks | idle 1200 game-sec at time_scale 20 yields >= 1 `stuck` |
| `client-dedup` | 245 exact duplicate rows | identical event in the same tick is logged once (engine and telemetry.js paths) |
| `resend-carries-event-id` | duplicates could not be told apart from real repeats | every posted row has `payload.event_id`; a re-sent row keeps its id; already-acked ids are not re-queued |
| `telemetry-requeue-skips-sent` | — | event ids unique; `sentIds` ledger present |
| `session-start-first` | 32 sessions without `session_start` | first engine event of any session is `session_start` (synthetic `{synthetic:true,reason:"missing_session_start"}` if needed) |
| `automation-flagged` | 236/251 sessions were headless test traffic, indistinguishable from players | `payload.is_automation` true for `navigator.webdriver` / headless UA, false for a normal UA |
| `client-version-on-every-event` | payloads had no build identity, so old exports mixed with the current release | every buffered and posted `payload.client_version` is a non-empty string; telemetry.js path equals the sandbox stamp |
| `cap-keeps-milestones` | a real session lost ~3,650 game-sec (village, compass, path) once the 2,500-row cap tripped on hover/mouse noise | after the cap, milestone events (`phase_time`, `player_action`, `build`, `unlock`, `death`, `goal_prompt_shown`, `goal_prompt_acted`, `stage_reached`, ...) are kept, UI noise dropped |
| `worker-assign-logged` | village job assignment had no event, so cured-meat / income bugs could not be attributed | `assign_worker` writes `worker_assign {job, delta, workers, population, buildings}` |
| `cured-meat-first-logged` | `cured meat` was consumed but never produced (`no_producer`) | first charcutier yield writes `cured_meat_first {source, workers, cured_meat, stores}` |

Analysis queries should filter `coalesce((payload->>'is_automation')::boolean,false) = false` **and**
`payload->>'client_version' = :current_release`, then still run surface `pm-telemetry-human-filter`
(UA / timing — `is_automation` alone missed 235 HeadlessChrome sessions). Collapse on `payload->>'event_id'`.

## Story check (`tools/verify/story.mjs`)

Drives the rule director with a deterministic player script. Per run, per node:

| node | trigger |
|---|---|
| room_fire | `light_fire` |
| stranger | fire > 1, builder 30s later |
| forest | 15s later, outside unlocked + 4 wood |
| village | builder_level 4, 100 wood, warm room, build hut |
| path | hut >= 1 and fur >= 1, compass event, take |
| world | path unlocked + packed meat, embark |
| slice_complete | pack cured meat, embark, walk the short path, return home alive |
| lodge | village + 200 wood / 10 fur / 5 meat, warm room → build lodge |
| smokehouse | lodge + 600 wood / 50 meat → build smokehouse |
| charcutier | assign a villager to charcutier |
| cured_meat | charcutier income raises `stores.cured_meat` above 0; it can be packed for embark |

FAIL = any node not reached. Gameplay numbers are not touched by this check.

Worker incomes (`tools/verify/income.mjs`) tick `INCOME` in isolation and assert the original `_INCOME` rates (hunter 0.5 fur+meat / 10s, charcutier 1 cured meat per 5 meat + 5 wood / 10s, skip when inputs are short).

## Full playthrough (`tools/verify/playthrough.mjs`)

Drives the remake engine from a fresh save through village economy (lodge / tannery / smokehouse / 熏肉 / 皮革), world map, combat, mines, dungeon, ship, fabricator, space ending, and prestige. Time scale 50×. Each stage records game-time and wall-clock. Exit 1 if any stage in `STAGES` is missing. Stuck report includes room, event id, last action, and missing flags.

Classic comparison: `classic-playthrough.mjs` uses the original cost/income/delay constants (cited `file:line`) for the same milestones.
