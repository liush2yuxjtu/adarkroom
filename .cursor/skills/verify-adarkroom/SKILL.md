---
name: verify-adarkroom
description: "Verify the A Dark Room Chinese remake (web build godot/build/web + original game at /classic/) on its LIVE Vercel deployment: READY state, 200 (not 302) reachability, real-mouse 生火 click in headless Chromium, console/network errors, adr.telemetry, screenshots. Use whenever a change to this repo is claimed to work or has been deployed."
---

# Verify adarkroom (live Vercel deployment)

The surface users touch is the **deployed Vercel URL**: `/` serves the remake (`godot/build/web`, copied to `dist/` by `scripts/prepare-vercel.sh`) and `/classic/` serves the original game. Verification means driving that live URL with real input.

**Incident lesson (2026-10-12):** the remake was declared working after a local/VM headless run plus Vercel READY + curl 200. On the live site the buttons did nothing. A local or VM build test, READY state, or HTTP 200 does NOT verify the deployed site. Run Drive against the live URL, every time.

## Launch

Nothing to launch locally. The target is a deployment:

1. Get the URL for the commit under test (PR preview or production) and confirm the deployment is ready: Vercel MCP `get_deployment` → `readyState == "READY"`, and its git SHA matches the candidate commit.
2. One-time harness setup on the box (PEP 668 blocks a system pip):
   ```bash
   python3 -m venv /workspace/.pwvenv && /workspace/.pwvenv/bin/pip install playwright && /workspace/.pwvenv/bin/python -m playwright install chromium
   ```
Teardown: none. The harness opens and closes its own browser.

## Doctor

```bash
.cursor/skills/verify-adarkroom/scripts/doctor.sh <base_url>
```
Every line must be `200`. `302` means Vercel Authentication protection is on: either disable `ssoProtection` on the project or use a protection bypass. A 404 on `engine.js`/`ui.js`/`data/*.json` means `dist/` was assembled wrong.

## Drive

```bash
/workspace/.pwvenv/bin/python .cursor/skills/verify-adarkroom/scripts/verify_live.py <base_url> /workspace/adr-verify
```
For each of `/` and `/classic/?lang=zh_cn`, it:
- waits for `networkidle` and asserts Chinese text (`小黑屋`, plus `醒来` on `/`);
- finds the button whose text starts with `生火` (remake: `button.adr` in `#panel-room`; classic: the `生火` button) and clicks it with **real mouse down → 80 ms → up** at the button's centre;
- asserts the state change: remake `#panel-room h1` becomes `生火间` (`document.title` on `/` stays `小黑屋 — A Dark Room 重制`, by design); classic `document.title` becomes `生火间`;
- records console errors, page errors, 4xx/5xx and failed requests (the aborted google-analytics beacon on `/classic/` is ignored);
- on `/`, reads `localStorage['adr.telemetry']` and requires a `player_action` event.

Exit 0 means every check passed. Never substitute `element.click()` or `dispatchEvent`. They bypass the bug class below and give a false PASS.

### Regression check: buttons rebuilt every frame (root cause of the 2026-10-12 incident)

`ui.js` `loop()` calls `game.tick()` on every `requestAnimationFrame`. `Game.prototype.tick` ends with `this.emit()`, which calls `renderAll()`, which runs `panel-room.innerHTML = ""` and creates new buttons, about 60 times per second. A real click is mousedown + mouseup on the *same* element. The button is replaced between them, so `click` never fires. JS `.click()` works, which is why synthetic tests passed. Evidence: a MutationObserver counted 61 `#panel-room h1` replacements per second; a real mouse click left the h1 at `小黑屋`; JS `.click()` changed it to `生火间`. `verify_live.py` uses real mouse input, so it catches this. For a quick manual probe:
```js
// in the live page: should be ~0 per second when idle, not ~60
new MutationObserver(m=>console.log(m.length)).observe(document.getElementById('panel-room'),{childList:true})
```

## Four live verification methods (all against the LIVE URL, never deploy)

Run all four. Any FAIL is a FAIL.

1. **Vercel (MCP `user-Vercel`; team `team_1VUYYia3RReNLUn2r8ciX2Nb`, project `adarkroom-zh`).**
   - Run `get_deployment` and check `readyState == READY`. `meta.githubCommitSha` must equal the candidate commit, and `alias` must contain the URL under test.
   - Run `list_deployment_events` for the build log. Expect `Prepared /vercel/path0/dist` and `Build Completed`.
   - Run `list_deployment_files` and `get_runtime_logs`. These are a static deployment, so 404 / no logs is normal, and the MCP may not be authorized for the team.
   - Run `web_fetch_vercel_url` on `/ui.js`, `/engine.js` and `/data/config.json`, plus `scripts/doctor.sh` with `curl -w '%{content_type}'`. Every asset must be `200` with `application/javascript`, `text/css`, or `application/json`, and never `text/html` (a rewrite to index.html). COOP/COEP (`same-origin`/`require-corp`) is set in `vercel.json`. It does not block the same-origin scripts.
2. **Telemetry DB.** The deployed `data/config.json` has `analytics_endpoint: ""` and `analytics_http_enabled: false`. Supabase `list_projects` has no adarkroom project. So there is **no backend telemetry DB**. `sinks/supabase.js` exists but is not wired in. Verify telemetry by reading `localStorage['adr.telemetry']` in the browser and require `player_action` after a click. Do not create a DB during verification.
3. **Playwright (real mouse):** `scripts/verify_live.py` (see Drive). Also click the menu buttons `加速.` and `设置.` and check that something visible changes. `设置.` opens a modal in `#overlay`, which `renderEvent()` clears on the next frame if no event is active.
4. **Chrome DevTools Protocol:** `scripts/cdp_inspect.sh <base_url>`. It launches Playwright's Chromium with `--remote-debugging-port=9333`, connects over CDP, and kills that Chromium on exit. It collects `Runtime.exceptionThrown`, `Network.loadingFailed`, 4xx/5xx `Network.responseReceived`, and `Log.entryAdded`. It runs `elementFromPoint` at each button centre (must be `self`, i.e. not covered by an overlay) and `DOMDebugger.getEventListeners` on `生火` (must include `click`). It also checks whether the button survives 2 animation frames and counts `#panel-room` mutations per second. PASS needs the button to survive and fewer than 5 mutations per second when idle. Output: `/workspace/adr-verify/cdp.json`.

## Evidence

Kept in `/workspace/adr-verify/` (survives cleanup): `live.png`, `classic.png`, `result.json`, `cdp.json` (URL, timestamp, HTTP status, before/after state, telemetry events, console errors, bad requests). Record the deployment URL, the commit SHA from `get_deployment`, and the timestamp in the report. Proof is the real click plus the changed state plus the telemetry side effect, not just a final screenshot.

## Cleanup

Nothing to kill. The harness closes its own Chromium. Do not delete `/workspace/adr-verify/`.

## Feature map

See `features/README.md`. Maintain with `/maintain-verification-skill`.
