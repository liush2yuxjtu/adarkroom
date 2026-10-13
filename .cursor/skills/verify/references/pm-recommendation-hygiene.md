# Surface `pm-recommendation-hygiene`

**Before giving PM recommendations**, classify each issue as one of:

| class | meaning |
|---|---|
| **(a) `remake-wrong`** | we implemented the original / classic pattern incorrectly |
| **(b) `missing-competitor-pattern`** | we never implemented what strong comparable games do |
| **(c) `implemented-poorly`** | we have the feature, but execution quality is weak |

Every class needs **evidence**. Do **not** recommend fixes for **(a)** or **(b)** without that classification.

This surface is **not** `original-intent-check` (is a UI proposal a new art direction vs the original?). It is **not** `verification-scope-mismatch` (which remake path is live?). It is **not** `aesthetic-community-consensus` (community taste). It is **not** `pm-telemetry-human-filter` (automated vs human sessions before a median). Those still run when they trigger. This one only answers: what *kind* of issue is this, before anyone writes a fix list.

## Triggers

- Any PM recommendation: "we should fix…", "players need…", "add a countdown / tutorial / juice / competitor feature", a prioritized backlog, or a post-playtest action list.
- A `/verify` or PR that turns a finding into a product change.

Skip only when no recommendation is being made (observation-only, no "do X").

## Method

For **each** recommended issue, in this order:

1. **Name the issue** in one sentence (what is wrong for the player, on which control or beat).
2. **Read the remake (live path).** Cite `file:line` for what we actually ship (`godot/build/web` on this remake). `verification-scope-mismatch` if several paths exist.
3. **Read the original / classic.** Cite `file:line` (`/classic/`, in-repo `script/` `css/`). Did the original already have this pattern?
4. **Read strong comparables** when the original does not have the pattern, or when quality (not presence) is the claim. Open the pages or play the build. Do not invent a competitor feature.
5. **Pick exactly one class** using the tests below. Record the evidence. Then, and only then, write a recommendation.

### Class tests

**(a) `remake-wrong`** — all of:

- The original implements pattern P (`file:line`).
- This remake claims to remake P (or P is required for fidelity).
- The live remake path implements P incorrectly or omits a load-bearing piece of P (`file:line` + what differs).

Evidence: original cite + remake cite + the specific mismatch. A new art language the original never used is **not** (a); that is `original-intent-check` (art direction), not a remake defect.

**(b) `missing-competitor-pattern`** — all of:

- The remake does **not** implement pattern Q (grep / `file:line` showing absence).
- The original also does **not** implement Q (so this is not (a)).
- At least one strong comparable (same genre or the same wait/idle/literary problem) does implement Q. Open the source, store page, essay, or a played build. Record the URL or `file:line`.

Evidence: remake absence + original absence + opened comparable. "Games usually have X" with no opened source is **FAIL**.

**(c) `implemented-poorly`** — all of:

- The remake **has** the feature (`file:line`).
- The original and/or a comparable also has it, and the remake's execution is weaker in a named way (too faint, no countdown, wrong size, wrong copy, dropped on one viewport).
- The gap is quality, not "never built" and not "copied the original wrong" (if the original's materials were copied incorrectly, that is (a)).

Evidence: remake cite of the existing feature + the quality gap + a reference (original and/or opened comparable) that shows a stronger execution.

If two classes seem to fit, pick the **earlier** letter that fully matches. A 3px faded cooldown bar that was meant to be the original's full-height overlay is **(a)** if the remake diverged from that overlay; it is **(c)** only if the remake intentionally shipped a different, present cue whose quality is the complaint.

## Recommendations

| class | What you may recommend | What you may not |
|---|---|---|
| **(a)** | Restore the original pattern (cite both sides). After classification + evidence. | Call it a new feature. Ship a competitor pattern as the "fix" for a remake miss. |
| **(b)** | Add Q as a **new** product choice, labeled competitor-pattern, not a remake bug. After classification + evidence. Also run `original-intent-check` when Q is UI/art. | Recommend Q as "we implemented the original wrong." Recommend Q with no opened comparable. |
| **(c)** | Tighten execution of the feature we already have. | Treat it as missing (b) or as a remake-wrong (a) without re-testing. |

**Do not recommend a fix for (a) or (b) unless the classification and its evidence are in the same note.** A bare "add a countdown" / "copy Cookie Clicker" / "fix the remake" is **FAIL**.

## Output

```
## pm-recommendation-hygiene

| issue | class (a/b/c) | remake evidence | original evidence | comparable evidence | recommendation allowed? |
|---|---|---|---|---|---|
| (one sentence) | remake-wrong / missing-competitor-pattern / implemented-poorly | `file:line` | `file:line` or "original lacks it" | opened URL / "n/a for (a)" | yes — (one line) / no — missing evidence |

**Rule check.** Fixes for (a) or (b) appear only on rows whose class + evidence are complete.
```

## Pass / fail

- **PASS** — every recommended issue has exactly one class, the matching evidence, and (a)/(b) fixes appear only after that.
- **FAIL** — a PM recommendation for (a) or (b) shipped without classification; class has no evidence; (b) is sold as a remake bug; (a) is sold as a new competitor feature; or a comparable was invented.
- **SKIP** — no PM recommendation is being made.
- **INCONCLUSIVE** — original or comparable sources could not be opened. Not a **PASS**. Do not recommend an (a) or (b) fix until they can.

## Worked examples (this remake)

**(c) then (a) — gather cooldown cue (2026-10-12).** Remake `ui.js` `paintCooldowns()` draws a `.cd` bar; `adr.css` made it a 3px underline at 40% opacity. Original `script/Button.js:26` / `108` + `css/main.css:270` is a full-height shrinking grey overlay. First pass called it "missing countdown" → wrong class (that would be (b), and the original has no number). Correct: the feature exists → quality gap vs the original overlay. If the remake *intended* to copy that overlay and shipped a 3px line instead, reclassify **(a) `remake-wrong`** and the fix is restore the overlay, not invent a numeric countdown. See `verification-scope-mismatch`.

**(b) — numeric cooldown seconds.** Original buttons have no remaining-seconds readout. Recommending "show `59` on 伐木" is **`missing-competitor-pattern`** (idle games often show a timer). Do not file it as remake-wrong. Requires an opened comparable before the rec. Also run `original-intent-check` (a number on the original's silent overlay is a new direction).

**(b) — Rajan timed text on early waits.** Original wait is mostly silent. Literary/idle comparables insert narrative beats. That is not (a). Classify (b), then `game-pacing-intent` + `art-style-boredom-mitigation` (`?style=text` can carry it; `?style=pixel` cannot).
