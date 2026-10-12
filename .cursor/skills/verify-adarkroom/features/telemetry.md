# Telemetry

## Sub-features
- Events stored in `localStorage['adr.telemetry']` (JSON array: `session_start`, `director_think`, `director_tool`, `player_action`, `phase_time`).
- `导出遥测.` downloads `adr-telemetry-<id>.json`.

## How to get to it (user POV)
Play on `/`. Events accumulate automatically. The menu button `导出遥测.` exports them.

## Driving it with Playwright
After the 生火 click, `verify_live.py` reads the key and requires `player_action`. Before any click, only `session_start` and `director_*` events exist.

## Gotchas
- `session_start`/`director_*` events appear without any input, so their presence does not prove a click worked. Require `player_action`.
