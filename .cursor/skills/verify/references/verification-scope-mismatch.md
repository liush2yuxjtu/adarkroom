# Surface `verification-scope-mismatch`

When verifying any UI, rendering, or interaction issue, enumerate every implementation path and identify which one is live before concluding.

This surface is **not** `aesthetic-community-consensus` (community evidence for a style choice), **not** `behavior-timeline-vs-mechanics` (intervals vs mechanic constants), **not** `pr-telemetry-required` (must the PR add events?), and **not** `vercel-live-deploy` (is the live URL playable?).

## Triggers

- UI, rendering, or interaction issue
- missing control, invisible cue, click / hover / disabled state
- CSS vs canvas vs DOM
- Godot scene script vs web UI script
- client vs server
- "the live site doesn't match the script I read"

## Method

Enumerate and check each class of path:

1. **Code paths.** Every implementation that could own the behavior (Godot scene script vs web UI script; client vs server; native vs exported).
2. **Rendering layers.** CSS vs inline styles; canvas vs DOM; parent opacity / inheritance; overlay vs sibling.
3. **Export or deploy targets.** What the live URL actually serves. Read `vercel.json` (or the equivalent) and the build output directory. Confirm with a fetched asset path, not a source-tree guess.

Mark which path is live **before** writing the conclusion.

## Output

| field | required content |
|---|---|
| paths enumerated | every code path, render layer, and deploy target that could own the issue |
| live path | which one the deployment serves, with evidence (`vercel.json`, build dir, or fetched URL) |
| per-path findings | `file:line` plus what that path does or does not draw / handle |
| conclusion | accounts for the live path; does not treat an unchecked path as the product |

A conclusion based on a single path when several exist is **FAIL**.

## Pass / fail

- **PASS** — every enumerated path was checked; the live target is identified with evidence; the conclusion follows from the live path.
- **FAIL** — a conclusion was drawn from one path while others exist, or the live target was not identified.
- **SKIP** — the issue is not UI, rendering, or interaction.

## Worked example: A Dark Room gather-wood cooldown bar (five-part case)

1. **Problem.** In the remake, the gather-wood button shows "no countdown" during its 60s cooldown.

2. **Wrong verification.** Read only the Godot scene script `godot/scripts/ui/Main.gd:118` (`_btn("伐木", ..., GameState.cooldowns.get("gather",0.0) > 0.0)`, which sets disabled only) and concluded there was no cooldown bar.

3. **Correct verification.** Vercel serves `godot/build/web` (an HTML/JS UI). `ui.js:14-18` `cdRatio()` uses max `{stoke:10, gather:60, traps:90}`; `ui.js:52-64` `paintCooldowns()` sets `bar.style.width = cdRatio*100%` each frame and disables the button. `adr.css:127-132` `.cd` is `position:absolute; bottom:0; height:3px; background:#111`. `adr.css:125` `button.adr[disabled]{opacity:0.4}` fades the button and the bar inside it, so the result is a 3px line at 40% opacity, nearly invisible. All on branch `cursor/godot-chinese-remake-5c3a` (live export `godot/build/web`).

4. **Original.** `doublespeakgames/adarkroom` `script/Button.js:26` appends `div.cooldown`; `Button.js:108` animates its width from 100% to 0% linearly over the cooldown; `css/main.css:270` positions `div.button div.cooldown` absolutely as a full-height grey block covering the button.

5. **Conclusion.** The feature isn't missing; the cue is too weak. Fix: make `.cd` full height (an overlay like the original) and stop it fading with the button (e.g. fade only the label, or use a separate disabled color), with an optional seconds readout.

| class | path | finding |
|---|---|---|
| code (not live) | `godot/scripts/ui/Main.gd:118` | `_btn("伐木", ..., GameState.cooldowns.get("gather",0.0) > 0.0)` sets disabled only |
| deploy target (live) | `vercel.json` → `godot/build/web` | HTML/JS UI, not the Godot scene script |
| code / live web | `ui.js:14-18` | `cdRatio()` uses max `{stoke:10, gather:60, traps:90}` |
| code / live web | `ui.js:52-64` | `paintCooldowns()` sets `bar.style.width = cdRatio*100%` each frame and disables the button |
| render layer | `adr.css:127-132` | `.cd` is `position:absolute; bottom:0; height:3px; background:#111` |
| render layer | `adr.css:125` | `button.adr[disabled]{opacity:0.4}` fades the button and the bar inside it → 3px line at 40% opacity |
| original | `script/Button.js:26` | appends `div.cooldown` |
| original | `script/Button.js:108` | animates width 100% → 0% linearly over the cooldown |
| original | `css/main.css:270` | `div.button div.cooldown` is a full-height grey overlay |
