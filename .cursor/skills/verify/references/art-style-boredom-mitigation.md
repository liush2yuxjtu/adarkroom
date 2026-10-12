# Surface `art-style-boredom-mitigation`

When the game has **early-waiting design** (cooldowns, resource-accumulation phases), check whether the **active art style** can carry Rajan-style timed text inserts. This surface runs **together with** `game-pacing-intent` / `python -m tools.pacing_analyzer --json` (`early_phase_slow`). It does not retune constants and it is not a bug check.

This surface is **not** `game-pacing-intent` (is the slow stretch intentional?), **not** `original-intent-check` (does a proposal conflict with the original?), and **not** `aesthetic-community-consensus` (community taste).

## Triggers

Run on every `/verify` that also runs the pacing analyzer, whenever any of these hold:

- the remake has early-waiting design: stoke / gather / traps cooldowns, or a resource-accumulation phase (`room_dark` / `room_fire` / `forest`)
- `early_phase_slow` is set in the analyzer JSON
- the live URL or claim names a style: `?style=text`, `?style=pixel`

Skip only when there is no early-waiting design and the analyzer was not in scope.

## Method

1. **Confirm early waiting.** Read `early_phase_slow` / `ratio` from `python -m tools.pacing_analyzer --json` (or the offline `--input` fixture). Also note the cooldown constants (`godot/scripts/GameLoop.gd` `cooldowns['gather']=60.0`, `stoke` 10s).
2. **Identify the active art style.** Query param, settings, or build flag:
   - `?style=text` (default remake): fonts + narrative text channel
   - `?style=pixel`: pure visual-asset style, no fonts (`assets/pixel/`; style-tweak PR in progress)
3. **Ask whether Rajan timed text is available.** Rajan's method inserts narrative beats at curve-derived timing points during the wait. It needs a text channel (fonts, event log, flavor lines).
4. **Verdict by style.** Do not invent a text channel for a pixel build.

| Active style | Rajan timed text | Verdict | What to do |
|---|---|---|---|
| `?style=text` (fonts present) | available | **PASS** | Keep Rajan inserts at mid-cooldown / tail idle points from the pacing curve |
| `?style=pixel` (no fonts; visual assets only) | unavailable | **NEEDS ALTERNATIVE** | Do not propose timed text. List pixel-suitable mitigations below |
| mixed / unknown | inconclusive | **INCONCLUSIVE** | Name the style evidence that is missing. Not a **PASS** |

## Pixel-suitable mitigations (`NEEDS ALTERNATIVE`)

List all of these when Rajan is unavailable. Do not substitute a font overlay on the pixel style.

1. **Ambient animation** — flame flicker, passing animals, sky changing over time.
2. **Visual storytelling** — silent beats in the room/forest (a shadow, a stack of wood growing, the fire brightening) at the same curve-derived timing points.
3. **Sound effects** — short, skippable cues on cooldown tick / phase idle (no voiceover that smuggles text back in).
4. **Visual progress cues** — shrinking overlay, woodpile / flame frame, sky palette — so the player is not polling readiness.

## Output

```
## art-style-boredom-mitigation

**Pacing.** early_phase_slow=(true/false) phase=… ratio=… (from tools.pacing_analyzer)
**Active style.** ?style=text | ?style=pixel | (other) — evidence (URL / flag / assets path)
**Rajan timed text.** available | unavailable
**Verdict.** PASS | NEEDS ALTERNATIVE | INCONCLUSIVE | SKIP

**If NEEDS ALTERNATIVE — pixel mitigations:**
- ambient animation: …
- visual storytelling: …
- sound effects: …
- visual progress cues: …
```

Missing the style, the Rajan available/unavailable bit, or (on pixel) the mitigation list is **FAIL**.

## Pass / fail

- **PASS** — `?style=text` (or another font/text style) and Rajan timed text is available. Recorded alongside the pacing JSON.
- **NEEDS ALTERNATIVE** — `?style=pixel` (or any no-font visual-asset style). Rajan is unavailable. Pixel mitigations listed. This is **not** a **PASS** and **not** a bug.
- **FAIL** — pixel style was treated as if timed text works; text style has no text channel and that was ignored; or the surface was skipped while `early_phase_slow` fired.
- **INCONCLUSIVE** — style cannot be determined. Not a **PASS**.
- **SKIP** — no early-waiting design and pacing was out of scope.

## Worked example: text vs pixel (this remake)

**Pacing.** Early waiting is designed in: gather 60s, stoke 10s. Analyzer can set `early_phase_slow` on `forest` (see `game-pacing-intent`).

**`?style=text`.** Default remake (`godot/build/web`) uses fonts and a narrative log. Rajan timed text is **available** → **PASS**. Insert flavor/narrative lines at mid-cooldown and tail idle points from the curve.

**`?style=pixel`.** Pure visual-asset style, no fonts. Pixel sheets live in `assets/pixel/` (style-tweak PR in progress). There is **no text channel**, so Rajan is **unavailable** → **NEEDS ALTERNATIVE**. Use flame flicker, sky changing over time, passing animals, visual storytelling, sound effects, and visual progress cues instead of timed text.
