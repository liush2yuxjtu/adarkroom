# Surface `game-pacing-intent`

On every `/verify` in this repository, if `tools/pacing_analyzer.py` exists at the repo root, **verify itself must automatically call** that analyzer and read its JSON. A slow early phase is an **intent question**, not a bug.

This is the **only trigger path**. Do not schedule a GitHub Action, cron, or a manual/human run of the analyzer as a substitute. A claim about "too slow" is not a substitute either.

This surface is **not** `behavior-timeline-vs-mechanics` (does frequency match the cooldown/cost constants?). That check can conclude "not a bug, sitting on the cap." This one asks whether the resulting slow stretch was a design choice. It is also **not** `pr-telemetry-required` and **not** the backend telemetry sink check.

After you read `early_phase_slow` / `ratio`, run [`art-style-boredom-mitigation`](art-style-boredom-mitigation.md) on the same wait: `?style=text` can use Rajan timed text; `?style=pixel` cannot.

## When to run

Automatically, on every `/verify` when `tools/pacing_analyzer.py` is at the repository root. Skip with a note when that file is missing, or when the JSON / playtest data is absent.

## Call

Run from the **repository root** (the directory that contains `tools/`):

```bash
python -m tools.pacing_analyzer --json
```

or in-process:

```python
from tools.pacing_analyzer import analyze
```

The module reads `@pacing` tags to build an expected per-phase curve, then compares it to actual Supabase `playtest_events` phase times.

| mode | how |
|---|---|
| live | env `SUPABASE_URL` plus a read key (the project's documented Supabase read key) |
| offline | `--input <file>` on the CLI, or pass that path into `analyze` |

Record cwd, command (or import), exit status, and stdout. Do not reconstruct the curve by hand when the tool exists.

## Read the JSON

Honor these fields from the report. Do not recompute medians to decide the trigger.

| field | use |
|---|---|
| `early_phase_slow` | truthy / non-empty → an early phase (`room_dark` / `room_fire` / `forest`) exceeded the curve |
| `ratio` | `actual_median / expected_max` for that phase |

Ask the intent question when `early_phase_slow` is set and `ratio` exceeds the configured threshold. Copy supporting fields from the same JSON when present (phase, expected max, actual median, session count, cooldown utilization).

## Configurable knobs

Record overrides in the project verifier. Environment variables win when both are set.

| knob | default | project verifier | environment |
|---|---|---|---|
| ratio threshold | `1.5` | `pacing_intent.ratio_threshold` | `VERIFY_PACING_INTENT_RATIO` |
| minimum sample size | `1` session | `pacing_intent.min_sessions` | `VERIFY_PACING_INTENT_MIN_SESSIONS` |
| early-phase names | analyzer's first phases (`room_dark`, `room_fire`, `forest`) | `pacing_intent.early_phases` | — |

With `min_sessions = 1`, "median" equals that session's phase duration. Raise the floor to `3` or more in the project verifier when enough playtests exist for a stable median. Do not invent extra sessions to reach the floor.

## Fallback

| situation | verdict | what to do |
|---|---|---|
| `tools/pacing_analyzer.py` missing at repo root | **SKIP** | note the missing path; do not invent a curve; do not file a GitHub Action / cron to "cover" it |
| JSON or data absent (`early_phase_slow` / `ratio` missing, empty `--input`, no phase rows) | **SKIP** | note that the report had no usable data; do not ask as if the trigger fired |
| analyzer present but the call fails after `SUPABASE_URL`+read key or `--input` were supplied | **BLOCKED** | keep the command and error; do not guess phase times |
| `early_phase_slow` set and `ratio` over threshold | ask the question below | **never** label the slowness a bug |

Missing tool or data is a **SKIP** with a note, not a **PASS**. Do not approximate the report.

## Output

Do **not** report a slow early phase as a bug. Ask the user, and wait.

Required shape: Chinese question + evidence table + branched mitigation list. Missing the question, any evidence field, or a bug label is **FAIL** for this surface (the check failed, not the game).

```
这个慢节奏是有意设计的吗？

这不是 bug。早期阶段的实际时长超过了 @pacing 曲线的预期上限。
请确认这是设计意图，还是数值需要调整。

| 字段 | 值 |
|---|---|
| phase | (early phase name) |
| expected max | (seconds from the analyzer / @pacing tags) |
| actual median | (seconds from playtest_events) |
| ratio | (actual / expected, vs configured threshold) |
| session count | (n) |
| cooldown utilization | (ready windows used / available; action timestamps) |
```

Then stop and wait for the answer.

### If the user says it is intentional

Do not retune constants. Suggest ways to fill the wait, and give **timing points derived from the curve** (mid-cooldown and remaining idle after the last capped action):

1. **Rajan's approach.** Insert text messages or narrative beats at those timing points during the slow stretch, so the wait carries story instead of empty time. Only when the active style has a text channel (`?style=text`). On `?style=pixel`, skip this and use `art-style-boredom-mitigation` instead.
2. **Visible cooldown countdown.** Show remaining seconds (and/or a full-height bar) so the player is not polling readiness.
3. **Ambient events.** Light world ticks that do not skip the wait: weather, passing sound, a stranger, a room change that does not grant the gated resource.
4. **Small flavor messages.** One-line color at the same timing points; keep them skippable and non-blocking.

### If the user says it is unintentional

Propose tuning the constants that built the curve: cooldown length, yield per action, phase-exit threshold, or the `@pacing` expected-max tag if the tag itself is wrong. Cite `file:line`. Do not silently change numbers.

## Pass / fail

- **PASS** — verify automatically called the analyzer (or applied a documented SKIP with a note); if `early_phase_slow` / `ratio` fired, the Chinese question and complete evidence table were shown and the slowness was **not** called a bug.
- **FAIL** — the slowness was reported as a bug; the question or an evidence field is missing; a curve was invented after SKIP; or verify waited for a GitHub Action / cron / manual run instead of calling the analyzer.
- **BLOCKED** — analyzer exists and the call failed after credentials or `--input` were supplied.
- **SKIP** — `tools/pacing_analyzer.py` or data is absent. Always include the skip note.

## Worked example: early `forest`

**Setup.** On every `/verify`, call from this repo root: `python -m tools.pacing_analyzer --json` (live: `SUPABASE_URL` + read key; offline: `--input <file>`). The module at `tools/pacing_analyzer.py` reads `@pacing` tags and compares them to `playtest_events` phase times. Gather cooldown is 60s (`godot/scripts/GameLoop.gd` `cooldowns['gather']=60.0`; upstream `script/outside.js` `_GATHER_DELAY: 60`). Early phases: `room_dark` / `room_fire` / `forest`. Defaults: ratio `1.5`, `min_sessions` `1`.

**One session.** Wall clock 525s, `game_time_sec` span 232s. Gathers at game time 64.8s / 130.2s / 190.2s (intervals 65.4s and 60.0s) — at the 60s cooldown cap. Available gather windows in 232s: three. Used: three. Cooldown utilization is at the cap, so the action is not broken; the early stage is just slow.

**Analyzer JSON (illustrative).** `@pacing` expected max for `forest` is 150s. Actual duration 232s.

```json
{
  "early_phase_slow": true,
  "phase": "forest",
  "expected_max": 150,
  "actual_median": 232,
  "ratio": 1.55,
  "session_count": 1
}
```

`early_phase_slow` is set and `ratio` `1.55` exceeds `1.5`. Sessions: 1.

**Required output.**

这个慢节奏是有意设计的吗？

这不是 bug。早期阶段的实际时长超过了 @pacing 曲线的预期上限。
请确认这是设计意图，还是数值需要调整。

| 字段 | 值 |
|---|---|
| phase | `forest` |
| expected max | 150s (`@pacing`) |
| actual median | 232s game time (wall clock 525s; game time can pause) |
| ratio | 1.55× (threshold 1.50×) |
| session count | 1 |
| cooldown utilization | gather 60s CD; 3/3 windows used at 64.8s / 130.2s / 190.2s (at cap) |

**If intentional — timing points from this curve.** Idle windows are the 60s caps after each gather. Place beats at mid-window and in the tail after the last gather:

| game time | kind |
|---|---|
| ~97s | mid-wait after gather 1 (64.8 + 30) |
| ~160s | mid-wait after gather 2 (130.2 + 30) |
| ~211s | tail after gather 3 (190.2 + ~20), before 232s phase end |

Use those marks for Rajan-style narrative lines, a visible gather countdown, ambient forest ticks, and short flavor text. Do not shorten the 60s cooldown unless the user later says the slowness is unintentional.

**If unintentional.** Propose lowering `cooldowns['gather']`, raising wood per gather, or lowering the forest exit threshold; or correcting the `@pacing` expected-max tag if 150s was never the intended band. Cite the constant's `file:line`.
