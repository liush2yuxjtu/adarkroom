# Surface `behavior-timeline-vs-mechanics`

When a question is about unusual player-behavior frequency, do not judge from the UI alone. Compare the session timeline to mechanic values in code.

This surface is **not** `pr-telemetry-required` (does the PR add events?), **not** the backend telemetry sink check (did rows land?), and **not** `game-pacing-intent` (is a slow early phase intentional?). A cooldown-cap match here is "not a bug"; the pacing-intent surface may still ask whether that wait was designed.

## Triggers

- unusual player-behavior frequency
- low click counts
- odd action intervals
- claims such as "players aren't clicking" or "this cooldown feels broken"

## Method

1. **Pull the timeline.** From Supabase `playtest_events`, load the session's full action timeline to the second. Use both `game_time_sec` and wall-clock `occurred_at`. Game time can pause; a long wall-clock session can contain little game time.
2. **Read the mechanic values.** Find the matching cooldown, cost, or consumption rate in code. Cite `file:line`. On a remake, also cite the original/upstream constant.
3. **Compare.** If observed intervals match the mechanic, the behavior is normal. Only a mismatch is a bug. Also record secondary signals, such as repeated checking between cooldowns.
4. **Output** the timeline data, the mechanic values with `file:line`, the comparison, and a bug yes/no verdict.

## Output

| field | required content |
|---|---|
| timeline | per-action `event_name`, `occurred_at`, `game_time_sec`, intervals |
| mechanic values | constant or table entry with `file:line` (plus upstream cite on a remake) |
| comparison | observed interval vs mechanic; match or mismatch |
| bug verdict | yes or no, plus any secondary UX signal that is not itself a mechanic bug |

Missing any of these is **FAIL**.

## Pass / fail

- **PASS** — all four outputs present; comparison completed. The bug verdict may be **no**.
- **FAIL** — timeline, mechanic citation, or comparison missing.
- **INCONCLUSIVE** — no `playtest_events` session to read. Not a **PASS**.
- **SKIP** — the question is not about action frequency.

A short click count that sits on the cooldown cap is not a bug. A UI that hides readiness can be a UX finding without flipping the bug verdict to yes.

## Worked example: A Dark Room gather wood

**Question.** Why so few wood gathers? Is the gather action broken?

**Mechanic values.**

- remake: `godot/scripts/GameLoop.gd` `cooldowns['gather']=60.0`
- upstream: `script/outside.js` `_GATHER_DELAY: 60`
- stoke: 10s cooldown

**Timeline (one session).**

| clock | value |
|---|---|
| wall clock | ~9 min |
| `game_time_sec` span | 232s |
| gathers at `game_time_sec` | 64.8s, 130.2s, 190.2s |
| gather intervals | 65.4s, 60.0s |
| gather cap in 232s | 4 |
| stoke | 20 clicks at ~10–12s (10s cooldown) |

**Comparison.** Gather intervals sit at the 60s cap. Stoke intervals sit at the 10s cap. Frequency matches the mechanics.

**Secondary signal.** A dozen inside/outside trips between gathers to check readiness, because the disabled button showed no countdown.

**Bug verdict.** No. The mechanic is behaving. The UX gap is the missing countdown, not a broken gather.
