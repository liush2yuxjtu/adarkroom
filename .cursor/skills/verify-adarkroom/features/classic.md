# Classic original game

## Sub-features
- Original A Dark Room under `/classic/`, Chinese via `?lang=zh_cn`.

## How to get to it (user POV)
Open `/classic/?lang=zh_cn`, or click `原版.` in the remake menu.

## Driving it with Playwright
`verify_live.py` clicks `生火` with the real mouse and asserts `document.title` == `生火间` and the notification `火堆燃烧着.`.

## Gotchas
- A google-analytics beacon is aborted in headless runs (`net::ERR_ABORTED`). Ignore it.
- The localStorage keys here are `lang` and `gameState`. There is no `adr.telemetry`.
