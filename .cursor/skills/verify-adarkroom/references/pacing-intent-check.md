# pacing-intent-check

On-demand surface. The remake verify skill runs this on **every** verify pass. There is no GitHub Action, cron, webhook, or manual schedule.

## Status

Code-only. Does not need a live Vercel deploy. Reads `@pacing` tags in `godot/build/web` + `godot/scripts` and compares `playtest_events` (offline `--input` or Supabase REST).

## Drive

From the repo root. This is the only call interface:

```
python3 -m tools.pacing_analyzer --json --input tools/testdata/playtest_events_sample.json
```

Against live `playtest_events` (needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_READ_KEY`; anon RLS is insert-only):

```
python3 -m tools.pacing_analyzer --json
```

Same payload via the stable import:

```python
from tools.pacing_analyzer import analyze
analyze(repo_root, input_path=None, supabase_url=None, key=None, slow_ratio=1.5)
```

## Pass criteria

- JSON parses and contains `phases`, `cooldown_utilization`, `resource_balance`, `early_phase_slow`
- `early_phase_slow` is `false` (any of `room_dark` / `room_fire` / `stranger` with `ratio >= slow_ratio`, default 1.5, fails)
- Exit code 0 from `--json`

`ratio` is `actual_median / expected_max`. Times are `game_time_sec`, not wall clock.

## Known limitations

A short playtest that never leaves `room_dark` will not set `early_phase_slow` unless that phase itself is 1.5× slower than its 30s window. Forest / village / path / world need longer sessions.
