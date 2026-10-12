# Light fire (remake)

## Sub-features
- Dark room intro note `醒来。头在痛。眼前模糊。去生火吧。`
- `生火` button → room title `小黑屋` becomes `生火间`, status line `火堆燃烧着`-style change, cooldown bar.

## How to get to it (user POV)
Open the deployment root `/`. The `生火` button is in the room panel.

## Driving it with Playwright
`scripts/verify_live.py <base_url>` uses a real mouse down/up on `button.adr` with text `生火`, then asserts `#panel-room h1` == `生火间`.

## Gotchas
- `document.title` does not change on `/`. Assert `#panel-room h1`.
- The panel is re-rendered by `renderAll()`. If it rebuilds every frame, real clicks are lost (2026-10-12 root cause). `element.click()` hides this. Use only real mouse input.
