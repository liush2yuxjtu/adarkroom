# Surface `original-intent-check`

Before proposing **any** UI, art, or interaction change, check the original's actual implementation and design intent. Confirm the proposal does not conflict with that direction. If it does, flag it to the user as a **deliberate art-direction change**, not a fix.

This surface is **not** `aesthetic-community-consensus` (opened community threads for taste), **not** `verification-scope-mismatch` (which remake path is live), **not** `game-pacing-intent` (is a slow phase intentional?), and **not** `pm-recommendation-hygiene` (is the issue remake-wrong vs missing-competitor vs implemented-poorly?). Community quotes here are evidence of the original's direction, not a vote on a new style. A (b) competitor-pattern recommendation that is UI/art still runs this surface before it is sold as a fix.

Skip only when there is no original (greenfield) or the change is not UI / art / interaction.

## Triggers

Run this surface **before** proposing or landing any of:

- UI, art, illustration, sprite, icon, pixel-art, canvas, or visual-theme changes
- interaction / control / cooldown / button / hover / disabled-state changes
- a remake "fix" that would add a new visual language the original did not use

Keywords and globs: `ui`, `art`, `sprite`, `pixel`, `canvas`, `drawImage`, `icon`, `theme`, `cooldown`, `.cd`, `button`, `interaction`, `*.png`, `*.svg`, `*.css`.

## Method

1. **Name the proposal.** One sentence: what would change, on which control, and why it is being called a fix or improvement.
2. **Read the original implementation.** If an original exists (this remake: `doublespeakgames/adarkroom` in-repo at `script/`, `css/`, `/classic/`), open the source that actually draws the control. Cite `file:line`. Grep the original UI for `<canvas`, `drawImage`, `sprite`, and `.png` when the proposal adds raster/canvas art.
3. **Read design intent.** Developer interviews, official posts, issues, and community write-ups that describe how the original was meant to look and feel. Open the pages. Do not invent quotes.
4. **Compare.** Does the proposal stay inside that direction (same materials: text, border, CSS overlay, typography), or does it introduce a new art language (sprites, canvas, pixel-art sets, illustrated icons)?
5. **Resolve.** Compatible → proceed and keep the original's materials. Conflict → **stop** and present the choice to the user. Do not ship the conflicting version as a "fix".

## Output

Use this template. Missing the original cites, the conflict verdict, or (on conflict) the user-facing choice is **FAIL**.

```
## original-intent-check

**Proposal.** (one sentence)

**Original implementation.**
- `file:line` — what that path actually draws / handles
- grep: `<canvas` / `drawImage` / `sprite` / `.png` in the original UI → (hits or none)

**Original design intent.**
| source | what it said about the original | opened URL |
|---|---|---|
| (interview / issue / essay / community) | (short quote or paraphrase from the opened page) | (URL) |

**Conflict?** yes / no
**Why.** (one paragraph: same materials vs new art direction)

**Resolution.**
- no conflict → compatible path (what to keep)
- conflict → flagged to the user as a deliberate art-direction change, not a fix; compatible alternative listed
```

## Pass / fail

- **PASS** — original implementation cited with `file:line` (or a documented "no original"); intent sources opened when they exist; conflict yes/no is explicit; a conflict was surfaced to the user as an art-direction choice, not merged as a fix.
- **FAIL** — a UI/art/interaction proposal proceeded without reading the original; original cites are missing; a conflicting change was labeled a fix; or the user was not given the choice / compatible alternative.
- **INCONCLUSIVE** — an original exists but its source or intent pages could not be opened. Not a **PASS**. Do not propose the change as a fix.
- **SKIP** — no original, or the change is not UI / art / interaction.

## Worked example: 2026-10-12 stoke cooldown

**Proposal.** A 16×16 pixel-art flame / woodpile sprite set for the remake stoke cooldown.

**Original implementation.** `doublespeakgames/adarkroom` buttons are plain text in a bordered `div`:

- `css/main.css:243-249` — `div.button{border:1px solid black;width:100px;padding:5px 10px}`
- `css/main.css:3` — body font `Times New Roman`
- `script/Button.js:26` — `el.append($("<div>").addClass('cooldown'))`
- `script/Button.js:108` — `$('div.cooldown', btn).width(left * 100 +"%").animate({width: '0%'}, …)` (shrinking grey overlay)

Grep of the original UI (`script/`, `css/`, `index.html`) for `<canvas`, `drawImage`, `sprite`, and `.png`: **no hits**. There are no sprites or canvas.

**Original design intent.** *In Media Res* describes it as "a single button-like bounded text box" that "becomes a shrinking gray box".

**Conflict?** yes. A new pixel-art direction vs the original's minimal-text style.

**Resolution.** Surface it to the user as a choice, not a fix. Compatible alternative: CSS-only — keep the shrinking overlay, no sprite set, optional text/glyph tint, no countdown number required.
