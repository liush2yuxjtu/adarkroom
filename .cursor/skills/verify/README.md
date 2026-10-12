# verify

User-level `/verify` skill: prove a change at the real caller **surface**, then persist the project verifier. Tests, typechecks, CI green, and Vercel READY are supporting evidence only.

The word is **surface**. Each named surface is a separate check with its own triggers, recipe, and verdict. Do not merge two surfaces into one result.

Verification has **two layers**. Surfaces **judge**. Concrete steps **execute**. Do not list a step as a surface.

| Layer | Role | Index |
|---|---|---|
| Judgment | Seven surfaces decide what evidence means | [`references/verification-surfaces.md`](references/verification-surfaces.md) |
| Execution | Pre-merge checklist, selected by the diff | [`references/concrete-verification-steps.md`](references/concrete-verification-steps.md) |

## Surfaces

Index: [`references/verification-surfaces.md`](references/verification-surfaces.md).

| Surface | When it runs | Pass / fail rule |
|---|---|---|
| `vercel-live-deploy` | Vercel-hosted web game or web app | LIVE URL + real mouse input + state change. READY + curl 200 is not a pass. |
| `<sink>-telemetry` | Deployed app claims a backend events sink | Rows for this run's session marker. `localStorage` is not enough. |
| `aesthetic-community-consensus` | Diff or claim touches UI, fonts, or visual style (`font`, `css`, `theme`, `ui`, `color`, or font/css/theme globs) | ≥3 independent sources actually opened. Fewer than 3 is **inconclusive, not a pass**. No invented quotes. |
| `pr-telemetry-required` | PR title/labels/commits contain `fix` / `bug` / `修复`, or a linked issue is a data question | FAIL if any of these is missing: problem/question, new `playtest_events` types+fields, verification query plus evidence rows landed. |
| `behavior-timeline-vs-mechanics` | Question about unusual player-behavior frequency (low clicks, odd intervals) | FAIL if timeline, mechanic `file:line`, or comparison is missing. Intervals that match the cooldown are **not a bug**. |
| `verification-scope-mismatch` | Verifying any UI, rendering, or interaction issue | Enumerate every code path, render layer, and export/deploy target; identify which one is live. A conclusion from a single path when several exist **fails**. |
| `game-pacing-intent` | Every `/verify` in this repo when `tools/pacing_analyzer.py` exists — verify itself must call it (no GitHub Action, cron, or manual run) | Read `early_phase_slow` / `ratio` from the analyzer JSON. Intent question, never a bug. Tool or data absent → **skip with a note**. |
| `wrong-repo-pr` | Game-code / game-verification work (or a PR whose paths and examples are about this remake) | Target repo, description, and file paths must match content ownership. Game work belongs in `liush2yuxjtu/adarkroom`, not `dot-pi`. If wrong: migrate, comment, close. |
| `original-intent-check` | Before proposing any UI / art / interaction change, when an original exists | Read the original implementation (`file:line`) and design intent. A conflict is a deliberate art-direction choice, not a fix. |

### `aesthetic-community-consensus`

Search V2EX, Reddit game communities (`r/gamedev`, `r/PixelArt`, `r/indiegames`, `r/godot`), Juejin, Jike, Bilibili, Zhihu, and GitHub issues/font repos when relevant. Output:

| community source | consensus points | link | supports current choice |
|---|---|---|---|
| … | … | opened URL | support / against / neutral |

End with an overall verdict, alternatives if the evidence is against the current choice, and coverage gaps (communities searched that yielded nothing).

**Worked example (A Dark Room Chinese font).** JetBrains Mono + Noto Sans SC lacked support. The original uses a serif Times New Roman. Alternatives named by the sources: Noto Serif SC, Fusion Pixel, Sarasa Mono.

Recipe: [`references/aesthetic-community-consensus.md`](references/aesthetic-community-consensus.md).

### `pr-telemetry-required`

Mandatory on bug-fix PRs and on PRs that answer a question existing data could not answer. Add instrumentation on the existing pipeline to Supabase `playtest_events` (`session_id`, `event_name`, `occurred_at`, `game_time_sec`, `phase`, `payload` jsonb). Distinct from the sink read-back surface: this one requires the PR to introduce the events.

**Worked example (A Dark Room save loss on refresh).** Events: `save_write`, `save_load`, `save_corrupt`, `new_game_start`. Query: sessions that restart within seconds of a load/corrupt.

Recipe: [`references/pr-telemetry-required.md`](references/pr-telemetry-required.md).

### `behavior-timeline-vs-mechanics`

Do not judge unusual frequency from the UI alone. (1) Pull the session timeline from `playtest_events` to the second, using `game_time_sec` and wall-clock time (game time can pause). (2) Read mechanic values in code with `file:line`. (3) Compare: match = normal; only a mismatch is a bug; note secondary signals such as checking between cooldowns. (4) Output timeline, mechanic cites, comparison, and bug yes/no.

**Worked example (A Dark Room gather wood).** Cooldown 60s (`godot/scripts/GameLoop.gd` `cooldowns['gather']=60.0`; upstream `script/outside.js` `_GATHER_DELAY: 60`). Wall clock ~9 min, game time 232s, gathers at 64.8s / 130.2s / 190.2s (intervals 65.4s and 60.0s) — at the cap of 4. Stoke: 10s cooldown, 20 clicks at ~10–12s. Verdict: not a bug. The UX issue was a dozen inside/outside trips because the disabled button showed no countdown.

Recipe: [`references/behavior-timeline-vs-mechanics.md`](references/behavior-timeline-vs-mechanics.md).

### `verification-scope-mismatch`

When verifying any UI, rendering, or interaction issue, first enumerate every implementation path: code paths (Godot scene script vs web UI script, client vs server), rendering layers (CSS vs inline styles, canvas vs DOM, parent opacity inheritance), and export or deploy targets (what the live URL actually serves; read `vercel.json` or the build output dir). Check each path and identify which one is live before concluding.

Output: paths enumerated; which path the deployment serves (with evidence); per-path findings; conclusion. A conclusion based on a single path when several exist fails the check.

**Worked example (A Dark Room gather-wood cooldown bar)** — five-part case:

1. **Problem.** In the remake, the gather-wood button shows "no countdown" during its 60s cooldown.
2. **Wrong verification.** Read only the Godot scene script `godot/scripts/ui/Main.gd:118` (`_btn("伐木", ..., GameState.cooldowns.get("gather",0.0) > 0.0)`, which sets disabled only) and concluded there was no cooldown bar.
3. **Correct verification.** Vercel serves `godot/build/web` (an HTML/JS UI). `ui.js:14-18` `cdRatio()` uses max `{stoke:10, gather:60, traps:90}`; `ui.js:52-64` `paintCooldowns()` sets `bar.style.width = cdRatio*100%` each frame and disables the button. `adr.css:127-132` `.cd` is `position:absolute; bottom:0; height:3px; background:#111`. `adr.css:125` `button.adr[disabled]{opacity:0.4}` fades the button and the bar inside it, so the result is a 3px line at 40% opacity, nearly invisible. All on branch `cursor/godot-chinese-remake-5c3a` (live export `godot/build/web`).
4. **Original.** `doublespeakgames/adarkroom` `script/Button.js:26` appends `div.cooldown`; `Button.js:108` animates its width from 100% to 0% linearly over the cooldown; `css/main.css:270` positions `div.button div.cooldown` absolutely as a full-height grey block covering the button.
5. **Conclusion.** The feature isn't missing; the cue is too weak. Fix: make `.cd` full height (an overlay like the original) and stop it fading with the button (e.g. fade only the label, or use a separate disabled color), with an optional seconds readout.

Recipe: [`references/verification-scope-mismatch.md`](references/verification-scope-mismatch.md).

### `game-pacing-intent`

On **every** `/verify` in this repo, if `tools/pacing_analyzer.py` is present at the repo root, verify **automatically calls** it. That is the only trigger path — not a GitHub Action, cron, or manual run. The module reads `@pacing` tags, builds an expected per-phase curve, and compares it to Supabase `playtest_events` phase times. Distinct from `behavior-timeline-vs-mechanics`: a cooldown-cap match is not a bug, but the resulting slow early stage still needs an intent question.

**Call** from the repository root: `python -m tools.pacing_analyzer --json` or `from tools.pacing_analyzer import analyze`. Live: `SUPABASE_URL` plus a read key. Offline: `--input <file>`.

**Read.** `early_phase_slow` and `ratio` from the JSON. Ask when `early_phase_slow` is set and `ratio` exceeds the threshold (default `1.5`, configurable). Tool or data absent → **skip with a note**; do not invent a curve.

**Output.** Do not report a bug. Ask 「这个慢节奏是有意设计的吗？」 plus an evidence table (phase, expected vs actual, ratio, session count, cooldown utilization). If intentional: Rajan-style narrative beats at curve-derived timing points, visible countdowns, ambient events, flavor messages. If unintentional: propose tuning the constants.

**Worked example (A Dark Room early forest).** Gather cooldown 60s. One session: wall clock 525s, game time 232s, gathers at 64.8s / 130.2s / 190.2s — at the cap. Not a bug; a slow early stage. JSON: `early_phase_slow` for `forest`, `ratio` `1.55`.

Recipe: [`references/pacing-intent-check.md`](references/pacing-intent-check.md).

### `wrong-repo-pr`

Game-code and game-verification changes belong in `liush2yuxjtu/adarkroom`, not the `dot-pi` agent-framework repo. Check that the PR's target repo matches content ownership, and that the description and file paths match that repo's structure. If wrong: migrate to the right repo and comment on the original PR.

**Worked example (dot-pi PR #169).** Verify surfaces were authored in `dot-pi` (`agent/skills/verify/`, HEAD `f2d76a7`) with adarkroom-local paths (`tools/pacing_analyzer.py`, `godot/build/web`, `playtest_events`). Destination of record is this repo at `.cursor/skills/verify/`.

Recipe: [`references/wrong-repo-pr.md`](references/wrong-repo-pr.md).

### `original-intent-check`

Before proposing any UI, art, or interaction change, check the original's actual implementation and design intent (source, developer interviews, issues, community discussion). If the proposal conflicts with that direction, flag it to the user as a deliberate art-direction change instead of a fix.

**Worked example (2026-10-12 stoke cooldown).** Original: plain-text bordered `div` (`css/main.css:243-249`, Times New Roman at `:3`) plus shrinking grey overlay (`script/Button.js:26` / `108`); no canvas/sprites. *In Media Res*: "a single button-like bounded text box" that "becomes a shrinking gray box". Proposal: 16×16 pixel-art flame/woodpile sprites. Conflict: new pixel-art direction vs minimal-text style. Compatible alternative: CSS-only shrinking overlay, optional text/glyph tint.

Recipe: [`references/original-intent-check.md`](references/original-intent-check.md).

## Execution layer

Standard checklist, run **on demand before each PR merge**. Not a surface. Pick steps from the mapping table; feed their artifacts into the matching surfaces.

| Step | Trigger | Pass |
|---|---|---|
| 1 Font check | Font / typeface / `@font-face` / `font-family` diff | Computed family+weight (e.g. Noto Serif SC, 500), `document.fonts` loaded, no tofu, screenshot |
| 2 Save and refresh | Save / `localStorage` / persist / refresh | Save key present; phase, resources, NPC JSON identical after reload |
| 3 Cooldown bar | Cooldown UI / `.cd` / disabled button | Full-height overlay, width shrinking, opacity 1, countdown number, screenshot |
| 4 Telemetry write | `playtest_events` / new event / sink | New row for this session via service/read key; anon is insert-only |
| 5 Mapping | every pre-merge diff | File types → steps → surfaces (below) |
| 6 Playwright multi-viewport UI audit | UI / layout / CSS / responsive / visual-style diff | 1280×800, 390×844, 1920×1080: layout, spacing, WCAG 4.5:1 contrast, tap targets ≥44px, alignment, no `x<0` clip, no horizontal scroll, no console/`requestfailed`; numbered issues + screenshots, then P0–P5 |

**Mapping (how steps feed surfaces).** A font change → step 1 **plus** `aesthetic-community-consensus`. A telemetry change → step 4 **plus** `pr-telemetry-required`. A UI/layout change → step 6 **plus** `verification-scope-mismatch`. For `verification-scope-mismatch`, run the matching step on the code that **actually runs live**. Pacing analyzer files have no checklist step; `game-pacing-intent` auto-calls the tool. Game work opened against `dot-pi` → `wrong-repo-pr`. Any UI/art/interaction proposal → `original-intent-check` first.

**Worked example (commit `5e3b891`).** Live export `godot/build/web`: font weight 500 loaded; cooldown overlay 39px tall at about 93% width; button opacity 1; save restored after reload.

Recipe: [`references/concrete-verification-steps.md`](references/concrete-verification-steps.md).

## See also

- [`SKILL.md`](./SKILL.md) — agent-facing procedure, two-layer split, claim table, and existing live-deploy / sink checks
- [`.cursor/skills/verify-adarkroom/`](../verify-adarkroom/SKILL.md) — operational live Vercel / Playwright / CDP / classic recipes
- [`references/wrong-repo-pr.md`](references/wrong-repo-pr.md) — game work must land in this repo
- [`references/original-intent-check.md`](references/original-intent-check.md) — remake UI/art/interaction vs the original's direction
