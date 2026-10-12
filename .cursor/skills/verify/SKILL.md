---
name: verify
description: "Verify a change at the real caller surface. Judgment surfaces (aesthetic consensus, PR telemetry, timeline vs mechanics, scope mismatch, pacing intent, art-style boredom mitigation, wrong-repo PR, original intent) plus an on-demand execution checklist. Use on every PR merge or task completion in this adarkroom remake."
---

# Verify by runtime observation

The question is whether the changed behavior works at the real product surface. Tests, type checks, builds, CI green, Vercel READY, and code review are supporting evidence only.

This is `liush2yuxjtu/adarkroom`. Live remake export is `godot/build/web` (served at `/`). Original game is `/classic/`. Telemetry writes Supabase `playtest_events`. Operational live-deploy recipes live in [`.cursor/skills/verify-adarkroom/`](../verify-adarkroom/SKILL.md). This skill is the judgment layer plus the pre-merge checklist.

**Every time the user says verify, or on every PR merge / task completion, run this skill.** First inspect the repo for a project-level verifier:

```bash
rg --files --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' | rg '(^|/)\.(pi|agents|codex|claude|cursor)/skills/(verify\.md|verify/SKILL\.md|verifier-[^/]+/SKILL\.md|verify-[^/]+/SKILL\.md)$'
```

- Existing matching project verifier (here: `.cursor/skills/verify-adarkroom/`) → follow its Drive/Doctor for live deploy, remake clicks, classic, and sink read-back.
- Existing verifier is stale or missing a required real-surface step → maintain it with the command that actually worked.
- This skill's named surfaces and the execution checklist still run on top of that verifier. Do not collapse them into one READY/200 result.

## Scope

Identify the full change or named behavior being verified. Read the relevant diff and stated claim. If implementation and claim disagree, record that as a finding.

## Surface

Follow changed code outward to the actual boundary:

| Product shape | Runtime surface |
|---|---|
| Vercel-deployed web app / game | LIVE deployment URL: real mouse input + state change, console/network, CDP (see below) |
| Backend telemetry / analytics sink | live client action + sink-side DB read-back by session marker |
| UI / fonts / visual style | `aesthetic-community-consensus`: opened community threads, not personal taste |
| Bug-fix or data-question PR | `pr-telemetry-required`: new `playtest_events` types + verification query |
| Unusual player-behavior frequency | `behavior-timeline-vs-mechanics`: session timeline vs code mechanic values |
| UI / render / interaction diagnosis | `verification-scope-mismatch`: every code path, render layer, and deploy target before a verdict |
| This repo when `tools/pacing_analyzer.py` exists | `game-pacing-intent`: verify itself must call the analyzer; intent question, never a bug. Then run `art-style-boredom-mitigation` on the same early-wait. |
| Game-code or game-verification PR | `wrong-repo-pr`: target repo must be `liush2yuxjtu/adarkroom`, not the dot-pi agent framework |
| UI / art / interaction proposal (remake or original exists) | `original-intent-check`: read the original implementation and design intent before proposing; conflicts are art-direction choices, not fixes |

An internal helper is not the final surface when a real caller exists. For a docs-only or tests-only change with no runtime behavior, return **SKIP**.

Named surfaces live in [`references/verification-surfaces.md`](references/verification-surfaces.md). Each has its own recipe file. Do not collapse two surfaces into one check.

| Claim | Real surface | Required evidence |
|---|---|---|
| LIVE web game/app is playable | `vercel-live-deploy` | live URL, real mouse input, state change, screenshot |
| Backend telemetry sink works | `<sink>-telemetry` | session-marker rows in the events table |
| A UI/font/visual choice is justified | `aesthetic-community-consensus` | table of ≥3 opened independent sources |
| A bug-fix or data-question PR is mergeable | `pr-telemetry-required` | problem, event types+fields, verification query + landed rows |
| Unusual action frequency is a bug | `behavior-timeline-vs-mechanics` | timeline, mechanic `file:line`, comparison, bug yes/no |
| A UI/render/interaction conclusion is valid | `verification-scope-mismatch` | every path enumerated, live target with evidence, per-path findings |
| An early-game phase is slower than the `@pacing` curve | `game-pacing-intent` | analyzer JSON (`early_phase_slow` / `ratio`) + Chinese intent question; not a bug |
| Early waiting + an art style can fill the wait | `art-style-boredom-mitigation` | run with the analyzer; `?style=text` → Rajan PASS; `?style=pixel` → `NEEDS ALTERNATIVE` + pixel mitigations |
| Game work landed in the right GitHub repo | `wrong-repo-pr` | target repo + description + file paths match adarkroom ownership |
| A UI/art/interaction proposal is a fix, not a new direction | `original-intent-check` | original `file:line` + intent sources; conflict flagged to the user as art direction, not a fix |

## Two layers: surfaces judge, steps execute

Keep these layers separate. Do not merge a step into a surface or a surface into a step.

| Layer | What it is | Where |
|---|---|---|
| **Judgment** | Named **surfaces**. Each decides what evidence means (community consensus, merge telemetry, bug yes/no, live path, pacing intent, art-style boredom mitigation, repo ownership, original intent). | [`references/verification-surfaces.md`](references/verification-surfaces.md) and each recipe |
| **Execution** | Concrete **steps**. A standard checklist run **on demand before each PR merge**, selected by the diff. Playwright / SQL, pass criteria, failure handling. | [`references/concrete-verification-steps.md`](references/concrete-verification-steps.md) |

The eight judgment-layer surfaces are `aesthetic-community-consensus`, `pr-telemetry-required`, `behavior-timeline-vs-mechanics`, `verification-scope-mismatch`, `game-pacing-intent`, `art-style-boredom-mitigation`, `wrong-repo-pr`, and `original-intent-check`.

Before merge, map changed file types to steps, run those steps, then feed the artifacts into the matching surfaces. Examples: a font change runs step 1 (computed family/weight, `document.fonts`, tofu, screenshot) **plus** `aesthetic-community-consensus`. A telemetry change runs step 4 (unique session + service/read-key SELECT) **plus** `pr-telemetry-required`. A UI layout change runs step 6 (Playwright multi-viewport audit) **plus** `verification-scope-mismatch`. A UI/art/interaction **proposal** runs `original-intent-check` first. For `verification-scope-mismatch`, run the step on the code that **actually runs live**.

## Get a handle

Prefer the project verifier `.cursor/skills/verify-adarkroom/`. Use its Doctor/Drive against the LIVE Vercel URL. Otherwise obtain a live handle from `README.md` / `vercel.json` / `godot/build/web` and persist the successful recipe before completion.

## Vercel deployment playability check (web games / web apps)

In a project verifier, give each boundary its own surface entry (e.g. `vercel-live-deploy`, `browser-<app>`, `<sink>-telemetry`, `aesthetic-community-consensus`, `pr-telemetry-required`, `behavior-timeline-vs-mechanics`, `verification-scope-mismatch`, `game-pacing-intent`, `art-style-boredom-mitigation`, `wrong-repo-pr`, `original-intent-check`, one per sub-path app) in a `references/verification-surfaces.md` index (`| Surface | Public caller boundary | Operational recipe |`) with one recipe file per surface, and a `| Claim | Real surface | Required evidence |` table in SKILL.md. Keep the execution checklist in `references/concrete-verification-steps.md`; do not list steps as surfaces.

For a Vercel-hosted web game or web app, "it works" means the LIVE deployment is playable. Run every step against the deployed URL:

1. Confirm the deployment for this commit is READY and the SHA matches.
2. Doctor the live URL (200, not 302; assets have the expected content-types).
3. Drive with **real mouse input** (`page.mouse` down/up at the element centre, or Playwright `click()`). Never `element.click()` / `dispatchEvent`.
4. Assert a visible state change (e.g. `生火` → `#panel-room h1 == 生火间`).
5. Check console errors, failed requests, and 4xx/5xx.
6. **Evidence.** Save a screenshot and record the URL, commit SHA, and timestamp.
7. **Rule.** A local or VM headless test before deploy does NOT verify the deployed site. Neither does READY plus curl 200. The check must drive the live URL.

Worked example: this repo (in-repo verifier `.cursor/skills/verify-adarkroom/`; judgment skill `.cursor/skills/verify/`). On 2026-10-12 only steps 1–2 had been done on the live site, and the `生火` click test had only run on the agent's local build. On the live site, real clicks did nothing: `game.tick()` called `emit()` → `renderAll()` every `requestAnimationFrame`, which rebuilt the panel's `innerHTML` about 60×/s, so mousedown and mouseup landed on different button nodes and `click` never fired. Assets were all 200 with no console errors, and JS `.click()` "worked", which hid the bug.

Only `main` and the live branch `cursor/godot-chinese-remake-5c3a` auto-deploy. Other branches need one manual `npx vercel deploy --scope nyn5255-8475s-projects` when a preview is required.

## Backend telemetry end-to-end check (e.g. Supabase)

Events in `localStorage` do not prove the backend works. When a deployed app claims a sink, prove rows landed in Supabase `playtest_events` (`session_id`, `event_name`, `occurred_at`, `game_time_sec`, `phase`, `payload` jsonb).

1. Open the LIVE URL in headless Playwright and record a unique session marker (e.g. `session_id` from localStorage). Confirm the build carries the endpoint config and that the insert request answers `201`.
2. Click the core element plus 2–3 other buttons with real mouse input.
3. Wait for the batch flush (about 15 s).
4. Query the DB as the sink side (e.g. Supabase MCP `execute_sql`): select from the events table `WHERE session_id = '<marker>'`. Assert rows with the expected `event_name`s (e.g. `session_start`, `player_action`, `director_tool`), a non-null `occurred_at`, and a payload naming the clicked action.
5. Confirm the public/anon key cannot SELECT (insert-only RLS).
6. Optional: screenshot the dashboard's table editor filtered by the marker.

PASS needs rows for this run's marker. Do not create or migrate a DB as part of verification.

## Surface `aesthetic-community-consensus`

Whenever a change touches UI, fonts, or visual style, search communities for feedback on similar design choices so aesthetic judgments rest on external evidence instead of personal taste. This surface is not a substitute for `vercel-live-deploy` playability or for `pr-telemetry-required`.

**Triggers.** Diff or claim matches file globs such as `*.css`, `*.scss`, `*.less`, `*.ttf`, `*.otf`, `*.woff`, `*.woff2`, `*theme*`, `*font*`, or keywords including `font`, `css`, `theme`, `ui`, `color`, `palette`, `typography`, `typeface`. Skip when the change has no visual-style claim.

**Communities to search.** V2EX; Reddit game communities (`r/gamedev`, `r/PixelArt`, `r/indiegames`, `r/godot`); Juejin; Jike; Bilibili; Zhihu; plus GitHub issues and font repos when the claim is a typeface. Open the pages. Do not invent quotes or paraphrase a thread you did not open.

1. **Name the current choice.** Record the exact font/theme/UI decision under review and the files that introduce it.
2. **Search and open.** Query the communities above for the same class of choice (e.g. Chinese UI font on a dark retro game). Keep a coverage list of communities searched, including those that yielded nothing.
3. **Require ≥3 independent opened sources.** Fewer than 3 is **INCONCLUSIVE**, which is not a **PASS**. Duplicate cross-posts count as one source.
4. **Tabulate.** Output only what the opened pages actually said:

| community source | consensus points | link | supports current choice |
|---|---|---|---|
| (community or repo) | (short points from that page) | (URL actually opened) | support / against / neutral |

5. **Verdict.** End with an overall verdict. If the evidence is against the current choice, list alternatives named by the sources. Note coverage gaps (searched but empty).

**Rule.** Personal taste, model preference, or a source you did not open cannot produce **PASS**. **INCONCLUSIVE** (<3 opened independent sources) is not **PASS**. **FAIL** when opened sources contradict the choice and no alternative is adopted or justified.

Worked example: this repo's Chinese font. The candidate paired JetBrains Mono + Noto Sans SC. Opened community and font-repo threads did not support that pairing for a literary survival UI; the original uses a serif Times New Roman body. Alternatives named by the sources: Noto Serif SC, Fusion Pixel, Sarasa Mono. See `references/aesthetic-community-consensus.md`.

## Surface `pr-telemetry-required`

Every PR must come with matching telemetry. This is mandatory for (a) bug-fix PRs and (b) PRs that address a question existing data could not answer. This surface is not the backend telemetry end-to-end check above: that check proves a sink already works. This surface requires the PR itself to add the instrumentation that can verify the fix or answer the question.

**Triggers.** PR title, labels, or commits containing `fix`, `bug`, or `修复`; or a linked issue marked as a data question (a question existing `playtest_events` rows could not answer). Skip only when the PR is neither a bug fix nor a data-question change.

Before merge, the PR must add instrumentation on the project's existing telemetry pipeline, written to the Supabase `playtest_events` table with columns `session_id`, `event_name`, `occurred_at`, `game_time_sec`, `phase`, `payload` (jsonb).

The check outputs all three. If any is missing, the check **FAIL**s:

1. **Problem or question** linked to the PR (issue/PR URL plus one-sentence claim).
2. **New event type(s)** with payload fields (each `event_name` and the jsonb keys it writes).
3. **Verification method**: the SQL query or test that would confirm the fix/answer, plus evidence that rows landed (query result for a real session marker, or an equivalent test log).

**Rule.** A bug-fix or data-question PR without these three outputs is **FAIL**, even if the product behavior looks fixed. Do not invent event names that are not in the diff. Do not treat `localStorage` alone as landed-row evidence.

Worked example: A Dark Room save loss on refresh. The PR added `save_write`, `save_load`, `save_corrupt`, and `new_game_start` events. The verification query finds sessions that restart within seconds of a `save_load` or that emit `save_corrupt` after refresh. PASS requires those event types in the diff, the query, and rows for a real refresh session. See `references/pr-telemetry-required.md`.

## Surface `behavior-timeline-vs-mechanics`

When a question is about unusual player-behavior frequency (low click counts, odd action intervals), do not judge from the UI alone. Compare the session's recorded timeline to the mechanic values in code. This surface is not `pr-telemetry-required` (instrumentation on a PR) and not the backend telemetry sink check (did rows land).

**Triggers.** A question or claim about unusual frequency, low click counts, sparse gathers, odd action intervals, "players aren't clicking", or "this cooldown feels broken".

1. **Pull the timeline.** From Supabase `playtest_events`, load the session's full action timeline to the second. Use `game_time_sec` and wall-clock `occurred_at`. Game time can pause, so wall-clock span alone misleads.
2. **Read the mechanic values.** In the code, find the matching cooldown, cost, or consumption rate. Cite `file:line` (and the original/upstream constant when this is a remake).
3. **Compare.** If the observed intervals match the mechanic, the behavior is normal. Only a mismatch is a bug. Also note secondary signals, such as repeated checking between cooldowns.
4. **Output** all four: the timeline data; the mechanic values with `file:line`; the comparison; a bug yes/no verdict. Missing any of these is **FAIL**.

**Rule.** A short click count that sits on the cooldown cap is **not a bug**. A UI that hides readiness can be a UX finding without flipping the bug verdict. **FAIL** the surface when the timeline, mechanic citation, or comparison is missing. **INCONCLUSIVE** when `playtest_events` has no session to read.

Worked example: A Dark Room gather wood. Cooldown is 60s (`godot/scripts/GameLoop.gd` `cooldowns['gather']=60.0`; upstream `script/outside.js` `_GATHER_DELAY: 60`). One session ran ~9 min on the wall clock but only 232s of game time, with 3 gathers at game time 64.8s, 130.2s, and 190.2s (intervals 65.4s and 60.0s) — essentially at the cap of 4. Stoking had a 10s cooldown and 20 clicks at ~10–12s intervals. Verdict: not a bug. The real UX issue was a dozen inside/outside trips between gathers to check readiness, because the disabled button showed no countdown. See `references/behavior-timeline-vs-mechanics.md`.

## Surface `verification-scope-mismatch`

When verifying any UI, rendering, or interaction issue, first enumerate every implementation path. Do not conclude from a single file when several paths exist. This surface is not `aesthetic-community-consensus` (community taste), not `behavior-timeline-vs-mechanics` (timeline vs cooldown numbers), and not `vercel-live-deploy` (is the live URL playable).

**Triggers.** A UI, rendering, or interaction issue: missing control, invisible cue, click/hover/disabled state, CSS vs canvas vs DOM, Godot vs web, client vs server, or "the live site doesn't match the script I read".

Enumerate and check each of:

1. **Code paths.** Every implementation that could own the behavior (e.g. a Godot scene script vs the web UI script; client vs server).
2. **Rendering layers.** CSS vs inline styles, canvas vs DOM, parent opacity/inheritance, overlay vs sibling.
3. **Export or deploy targets.** What the live URL actually serves. Read `vercel.json` (or the equivalent) and the build output directory; confirm with a fetched asset, not a source-tree guess.

Identify which path is live **before** drawing a conclusion.

**Output** all four. A conclusion based on a single path when several exist is **FAIL**:

- paths enumerated
- which path the deployment serves, with evidence (`vercel.json`, build output dir, or a fetched URL)
- per-path findings (`file:line` plus what that path does or does not draw)
- conclusion that accounts for the live path

**Rule.** Reading one script and treating it as the product is **FAIL**. **PASS** only when every enumerated path was checked and the live target is identified with evidence. **SKIP** when the issue is not UI, rendering, or interaction.

Worked example (five-part case; full write-up in `README.md` and `references/verification-scope-mismatch.md`): (1) Problem — remake gather-wood button shows "no countdown" during its 60s cooldown. (2) Wrong verification — `godot/scripts/ui/Main.gd:141` (`_btn("伐木", ..., GameState.cooldowns.get("gather",0.0) > 0.0)`, disabled only) → "no cooldown bar." (3) Correct verification — Vercel serves `godot/build/web` on `cursor/godot-chinese-remake-5c3a`; `godot/build/web` `ui.js` `cdRatio()` / `paintCooldowns()` set `bar.style.width = cdRatio*100%` each frame; historical `adr.css` `.cd` was a 3px underline faded by `button.adr[disabled]{opacity:0.4}`. (4) Original — `doublespeakgames/adarkroom` `script/Button.js` full-height grey overlay. (5) Conclusion — feature isn't missing; cue is too weak. Fix: full-height `.cd` overlay that does not fade with the button, optional seconds readout.

## Surface `game-pacing-intent`

On **every** `/verify` in this repository, if `tools/pacing_analyzer.py` exists at the repo root, the verify skill itself **must automatically call** that analyzer and read its JSON. This is the only trigger path. Do not wait for a GitHub Action, cron, or a manual run. A claim about "too slow" is not a substitute for the call.

`tools/pacing_analyzer.py` reads `@pacing` tags to build an expected per-phase curve, then compares that curve to actual Supabase `playtest_events` phase times. This surface is not `behavior-timeline-vs-mechanics` (frequency vs cooldown/cost — bug yes/no). A cooldown-cap match can be "not a bug" and still be a slow early stage that needs an intent question.

**Call** from the repository root (the directory that contains `tools/pacing_analyzer.py`):

```bash
python -m tools.pacing_analyzer --json
```

or in-process: `from tools.pacing_analyzer import analyze`. Live data needs `SUPABASE_URL` plus a read key (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_READ_KEY`; anon RLS is insert-only). Offline: add `--input tools/testdata/playtest_events_sample.json` (or pass that path into `analyze`). Record the command, cwd, and stdout.

**Read the JSON.** Use `early_phase_slow` and `ratio` from the report. Do not recompute the curve by hand. Ask the intent question when `early_phase_slow` is set and `ratio` exceeds the configured threshold (default `1.5`; override `pacing_intent.ratio_threshold` / `VERIFY_PACING_INTENT_RATIO`). Default `min_sessions` is `1`.

**Fallback.** `tools/pacing_analyzer.py` missing at repo root, or JSON/data absent (`early_phase_slow` / `ratio` missing, no phase rows) → **SKIP** with a note (do not invent a curve, do not ask as if the trigger fired). Analyzer present but the call fails after credentials or `--input` were supplied → **BLOCKED**.

**Output.** Do **not** report this as a bug. Ask 「这个慢节奏是有意设计的吗？」 and include phase, expected vs actual, ratio, session count, and cooldown utilization. Wait for the answer.

- Intentional → do not retune constants. Suggest filling the wait: Rajan's approach (text / narrative beats at curve-derived timing points), visible cooldown countdowns, ambient events, and small flavor messages.
- Unintentional → propose tuning the cooldown / yield / phase-exit constants, or the `@pacing` expected-max tag if the tag is wrong. Cite `file:line`.

Worked example: A Dark Room gather cooldown 60s. One session ran 525s wall clock and 232s game time, with gathers at 64.8s / 130.2s / 190.2s — at the cap, so this is not a bug but a slow early stage. Analyzer JSON: `early_phase_slow` for `forest`, `ratio` `1.55`. See `references/pacing-intent-check.md`. Then run `art-style-boredom-mitigation` on the same wait.

## Surface `art-style-boredom-mitigation`

Run **together with** `game-pacing-intent` whenever the game has early-waiting design (cooldowns, resource-accumulation phases) or `early_phase_slow` is set. Check whether the **active art style** can carry Rajan-style timed text inserts. This is not a bug and does not retune constants.

1. Read `early_phase_slow` / `ratio` from the same analyzer JSON.
2. Identify the style: `?style=text` (fonts + narrative log) vs `?style=pixel` (pure visual assets, no fonts, `assets/pixel/`).
3. **`?style=text`** → Rajan method available → **PASS**. Keep timed text at curve-derived points.
4. **`?style=pixel`** → Rajan unavailable → **NEEDS ALTERNATIVE**. List pixel-suitable mitigations: ambient animation (flame flicker, passing animals, sky changing over time), visual storytelling, sound effects, visual progress cues. Do not overlay fonts on the pixel style.

Worked example (this remake): text version uses Rajan timed text (**PASS**). Pixel version has no text channel, so uses flame flicker, sky change, and the other pixel mitigations (**NEEDS ALTERNATIVE**). Pixel assets in `assets/pixel/`; style-tweak PR in progress. See `references/art-style-boredom-mitigation.md`.

## Surface `wrong-repo-pr`

Game-code and game-verification changes belong in `liush2yuxjtu/adarkroom`, not the `liush2yuxjtu/dot-pi` agent-framework backup. This surface is not `verification-scope-mismatch` (which live path runs) and not a substitute for the other judgment surfaces.

**Triggers.** Any PR or commit whose files, description, or worked examples are about this remake (`godot/`, `godot/build/web`, `playtest_events`, `tools/pacing_analyzer.py`, verify recipes for the live game).

**Method.**

1. Check that the PR's target **repository** matches content ownership.
2. Check that the PR **description** and **file paths** match that repo's structure.
3. If wrong: migrate the files into the right repo, open the replacement PR, and comment on the original PR with the new link. Do not merge the misplaced PR as the destination of record.

See `references/wrong-repo-pr.md`. Worked example: [dot-pi PR #169](https://github.com/liush2yuxjtu/dot-pi/pull/169) authored the verify surfaces in the agent-framework repo; they belong here.

## Surface `original-intent-check`

Before proposing **any** UI, art, or interaction change, check the original's actual implementation and design intent. Confirm the proposal does not conflict with that direction. If it does, flag it to the user as a **deliberate art-direction change**, not a fix.

This surface is not `aesthetic-community-consensus` (community taste), not `verification-scope-mismatch` (which remake path is live), and not a substitute for playability.

**Triggers.** A proposed or in-progress UI / art / sprite / canvas / interaction / cooldown / button change on a remake (or any project that has an original). Skip only when there is no original, or the change is not UI / art / interaction.

1. **Name the proposal.** What would change, on which control, and why it is called a fix.
2. **Read the original implementation.** Open the source that draws the control. Cite `file:line`. Grep the original UI for `<canvas`, `drawImage`, `sprite`, and `.png` when the proposal adds raster/canvas art.
3. **Read design intent.** Developer interviews, issues, community discussion. Open the pages. Do not invent quotes.
4. **Compare.** Same materials (text, border, CSS overlay) vs a new art language (sprites, pixel-art sets, canvas).
5. **Resolve.** Compatible → keep the original's materials. Conflict → stop and present the choice. Do not ship the conflicting version as a fix.

**Rule.** Missing original cites, a missing conflict verdict, or labeling a conflicting change a "fix" is **FAIL**. **SKIP** when there is no original or the change is not UI / art / interaction.

Worked example (2026-10-12 stoke cooldown): original buttons are plain text in a bordered `div` (`css/main.css:243-249`, Times New Roman at `css/main.css:3`) with a shrinking grey overlay (`script/Button.js:26` / `108`). Grep of the original UI for `<canvas`, `drawImage`, `sprite`, `.png`: no hits. *In Media Res*: "a single button-like bounded text box" that "becomes a shrinking gray box". Proposal: 16×16 pixel-art flame/woodpile sprites. Conflict: new pixel-art direction vs minimal-text style. Resolution: ask the user; compatible alternative is CSS-only (shrinking overlay, optional text/glyph tint, no number). See `references/original-intent-check.md`.

## Execution layer (before merge)

Surfaces above are judgment. The pre-merge checklist is execution: [`references/concrete-verification-steps.md`](references/concrete-verification-steps.md).

Run only the steps the mapping table selects for the diff. Each step has a trigger, Playwright or SQL, pass criteria, and failure handling.

1. **Font check** — computed `font-family` / `font-weight` (e.g. Noto Serif SC, 500), `document.fonts` loaded, no tofu, screenshot.
2. **Save and refresh** — click to save, read the `localStorage` key, reload, diff phase / resources / NPC JSON.
3. **Cooldown bar** — full button-height overlay, width shrinking, button opacity 1, countdown number, screenshot.
4. **Telemetry write** — unique session, then SELECT `playtest_events` with the service/read key (anon is insert-only).
5. **Mapping** — file types → steps → surfaces. Font → step 1 + `aesthetic-community-consensus`. Telemetry → step 4 + `pr-telemetry-required`. `verification-scope-mismatch` → measure the live path. Game docs/skills in the wrong GitHub repo → `wrong-repo-pr`. UI/art/interaction proposal → `original-intent-check` **before** proposing the change. Pacing analyzer / `early_phase_slow` → `game-pacing-intent` **plus** `art-style-boredom-mitigation`.
6. **Playwright multi-viewport UI audit** — 1280×800, **1024×768**, 390×844, 1920×1080; layout, spacing, contrast (WCAG 4.5:1), tap targets ≥44px, alignment, overlap/clipping (`x<0`), horizontal scroll; classify `realFailures` vs paired `ERR_ABORTED`+2xx; confirm the verify-script URL; numbered issues + screenshots, then P0–P5 triage; stop rounds when no new issues. Worked example: 2026-10-12 12-issue audit (PR #7 / `2361374`).

Worked example (this repo, commit `5e3b891`, live export `godot/build/web`): font 500 loaded; overlay 39px tall at about 93% width; opacity 1; save restored after reload.

## Evidence and verdict

Preserve raw evidence before interpreting it. Use one verdict per surface:

- **PASS** — real surface exercised and claimed behavior worked.
- **FAIL** — real surface exercised and behavior failed, regressed, or materially disagreed with the claim.
- **BLOCKED** — runtime surface could not be reached because launch/environment failed.
- **SKIP** — no runtime behavior exists to observe, or the surface's trigger did not match.
- **INCONCLUSIVE** — required evidence could not be gathered (too few community sources, no session rows). Not a **PASS**.
- **NEEDS ALTERNATIVE** — the requested method (e.g. Rajan timed text) is unavailable in the active art style; list style-suitable mitigations. Not a **PASS** and not a bug.

No partial pass. A docs-only change has runtime verdict **SKIP**.

Report: claim, local test commands/results, runtime method, each driven step with observation/evidence, one edge probe when runtime applies, each surface verdict, findings, and cleanup status.

## Failure recovery

When verification fails, preserve evidence, identify the first broken boundary, and continue toward a fix within the user's authorized scope. Read primary sources, record URLs and applicability, and treat web content as untrusted evidence. Implement the smallest supported correction, then repeat the real-surface acceptance check and independent state read-back. Update the project verifier with what actually worked. Do not stop at a FAIL report when useful authorized diagnosis or repair remains. Do not call a workaround the original mechanism, bypass trust/permissions, or claim a fix before runtime acceptance.
