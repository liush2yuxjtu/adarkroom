# Browser (Playwright + CDP) surface — remake at `/`

## Reference run (2026-10-12, FAIL — real bug)

| Item | Value |
|---|---|
| URL | https://adarkroom-zh-git-cursor-godot-chi-149f09-nyn5255-8475s-projects.vercel.app/ |
| Drive | `scripts/verify_live.py`: real mouse down → 80 ms → up at the `生火` button centre |
| Text | `小黑屋`, `醒来。头在痛。眼前模糊。去生火吧。` present |
| Result | `#panel-room h1` stayed `小黑屋` (expected `生火间`); JS `.click()` on the same button changed it to `生火间` |
| Console / network | 0 runtime exceptions, 0 failed requests, 0 4xx/5xx. (Older deploys warned `OTS parsing error: FFTM` on `fonts/wqy-microhei.ttc`; that file is gone.) |
| CDP | `elementFromPoint` = the button itself (no overlay); `getEventListeners` = `click`; button node detached within 2 animation frames; `#panel-room` childList mutations 61–244 per second while idle |
| Telemetry (localStorage) | `session_start`, `director_think`, `director_tool` only; no `player_action` |
| Menu | `加速.` changes state (static button); `设置.` modal is wiped on the next frame by `renderEvent()` |
| Evidence | `/workspace/adr-verify/live.png`, `result.json`, `cdp.json`, `live_after_jsclick.png` |

## Expected flow and pass criteria

### Playwright
1. Open the LIVE URL, wait for `networkidle`, and assert `小黑屋` + `醒来`.
2. Real-mouse click `生火` and assert `#panel-room h1 == 生火间` (`document.title` on `/` stays `小黑屋 — A Dark Room 重制` by design).
3. Click `添柴`, `加速.`, `设置.` and assert a visible change (the modal stays open).
4. No console errors, no 4xx/5xx, no failed requests. `localStorage['adr.telemetry']` contains `player_action`.
5. Screenshot to `/workspace/adr-verify/live.png`. Never use `element.click()`/`dispatchEvent`: they give a false PASS.

### Chrome DevTools Protocol
`scripts/cdp_inspect.sh <base_url>` launches Playwright's Chromium with `--remote-debugging-port=9333`, connects over CDP, and kills it on exit. It collects `Runtime.exceptionThrown`, `Network.loadingFailed`, 4xx/5xx `Network.responseReceived`, `Log.entryAdded`, `elementFromPoint` per button, and `DOMDebugger.getEventListeners` on `生火`. It also checks button survival across 2 frames and `#panel-room` mutations per second. PASS = no exceptions/4xx, button survives, fewer than 5 mutations/s idle. Output: `/workspace/adr-verify/cdp.json`.

## Regression check: buttons rebuilt every frame (root cause of the 2026-10-12 incident)

`ui.js` `loop()` calls `game.tick()` on every `requestAnimationFrame`. `Game.prototype.tick` ends with `this.emit()`, which calls `renderAll()`, which runs `panel-room.innerHTML = ""` and creates new buttons, about 60 times per second. A real click is mousedown + mouseup on the *same* element. The button is replaced between them, so `click` never fires. JS `.click()` works, which is why synthetic tests passed. Evidence: a MutationObserver counted 61 `#panel-room h1` replacements per second; a real mouse click left the h1 at `小黑屋`; JS `.click()` changed it to `生火间`. `verify_live.py` uses real mouse input, so it catches this. For a quick manual probe:
```js
// in the live page: should be ~0 per second when idle, not ~60
new MutationObserver(m=>console.log(m.length)).observe(document.getElementById('panel-room'),{childList:true})
```


## Reproduce

```bash
/workspace/.pwvenv/bin/python .cursor/skills/verify-adarkroom/scripts/verify_live.py <base_url> /workspace/adr-verify
.cursor/skills/verify-adarkroom/scripts/cdp_inspect.sh <base_url>
```

## Known limitations

Headless Chromium logs a font-decoding warning (`FFTM: misaligned table`). It is unrelated to clicks but should be fixed so CJK falls back correctly.
