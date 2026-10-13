# Telemetry

## Sub-features
- Events stored in `localStorage['adr.telemetry']` (JSON array). `director_think` is **debug** level: omitted from localStorage and Supabase unless `?telemetry_debug=1`, `localStorage.adr.telemetry_debug=1`, `config.telemetry_debug`, or `TELEMETRY_DEBUG=1`. Browser also writes visibility, mouse, hover, click, scroll, load, audio, page_unload/reload, and save lifecycle events.
- `导出遥测.` downloads `adr-telemetry-<id>.json`.

## How to get to it (user POV)
Play on `/`. Events accumulate automatically. The menu button `导出遥测.` exports them.

## Driving it with Playwright
After the 生火 click, `verify_live.py` reads the key and requires `player_action`. Before any click, only `session_start` (and `director_tool` if the director fired) exist. `director_think` is absent unless the debug switch is on.

## Gotchas
- `session_start`/`director_*` events appear without any input, so their presence does not prove a click worked. Require `player_action`.
- Every outbound payload must include `client_version` (short git SHA from `ADR_TELEMETRY`). PM numbers must run `pm-telemetry-human-filter` before quoting a median.
