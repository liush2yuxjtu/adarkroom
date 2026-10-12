# Execution layer: concrete verification steps

This file is **not** a surface. Surfaces judge. These steps execute.

Run the matching steps **on demand before each PR merge**, selected from the mapping table by the diff. Do not promote a step to a surface, and do not skip a required step because a related surface already has a verdict.

Each step records: trigger, how to execute, pass criteria, failure handling.

Drive the **live** URL when the change is deployed. Use real mouse input (`page.mouse` down/up at the element centre, or Playwright `click()`). Never `element.click()` / `dispatchEvent`. For `verification-scope-mismatch`, execute against the code path the live target actually serves.

## Step 1 — Playwright font check

**Trigger.** Diff or claim touches fonts, typefaces, or body/UI text styling: `*.ttf`, `*.otf`, `*.woff`, `*.woff2`, `*font*`, `@font-face`, `font-family`, `font-weight`, or a visual-style PR that names a face (e.g. Noto Serif SC).

**How to execute.** Open the live page. Read computed `font-family` / `font-weight` on the body (and one visible heading or button). Confirm `document.fonts` has the face loaded. Probe for missing glyphs / tofu. Screenshot and compare to the intended specimen.

```js
const page = await browser.newPage();
await page.goto(liveUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const computed = await page.evaluate(() => {
  const el = document.querySelector('body');
  const cs = getComputedStyle(el);
  return { family: cs.fontFamily, weight: cs.fontWeight };
});

const faces = await page.evaluate(() =>
  [...document.fonts].map((f) => ({
    family: f.family,
    weight: String(f.weight),
    status: f.status,
  }))
);

const loaded = await page.evaluate(
  (spec) => document.fonts.check(spec),
  '500 16px "Noto Serif SC"'
);

const tofu = await page.evaluate(() => {
  const sample = '生火间伐木';
  const probe = document.createElement('span');
  probe.textContent = sample;
  probe.style.fontFamily = getComputedStyle(document.body).fontFamily;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return {
    hasReplacement: document.body.innerText.includes('\uFFFD'),
    width,
    zeroWidth: width < 1,
  };
});

await page.screenshot({ path: 'artifacts/font-check.png', fullPage: true });
```

**Pass.** Computed family includes the intended face (e.g. `"Noto Serif SC"`). Computed weight is the intended weight (e.g. `500`). `document.fonts.check` is true and the face `status` is `"loaded"`. No U+FFFD, no zero-width CJK sample. Screenshot matches the intended specimen.

**Failure handling.** **FAIL** if family/weight is wrong, the face is not loaded, or tofu / zero-width CJK appears. Keep the computed object, the `document.fonts` list, and the screenshot. Do not pass on a CSS declaration alone. Then run surface `aesthetic-community-consensus` on the same choice — a loaded face can still fail that surface.

## Step 2 — Save and refresh

**Trigger.** Diff or claim touches persistence, save/load, `localStorage`, refresh recovery, or NPC/resource/phase state that must survive reload.

**How to execute.** Play until the game has a non-empty save. Click the control that writes the save (or wait for the autosave). Snapshot the save key. Reload. Diff the JSON.

```js
await page.click(saveButton); // real Playwright click, not element.click()

const before = await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) =>
    /save|adarkroom|adr/i.test(k)
  );
  const raw = key ? localStorage.getItem(key) : null;
  return { key, json: raw ? JSON.parse(raw) : null };
});
if (!before.key || !before.json) throw new Error('no localStorage save key');

const slice = (s) => ({
  phase: s.phase ?? s.currentPhase ?? s.room,
  resources: s.resources ?? s.stores,
  npcs: s.npcs ?? s.characters ?? s.builder,
});
const beforeSlice = slice(before.json);

await page.reload({ waitUntil: 'networkidle' });

const after = await page.evaluate((key) => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}, before.key);
const afterSlice = slice(after);

// pass only when these three are identical
JSON.stringify(beforeSlice) === JSON.stringify(afterSlice);
```

**Pass.** A save key exists before reload. After reload, `phase`, `resources`, and NPC state are identical to the pre-reload snapshot (JSON diff empty on those fields). The visible UI matches that snapshot.

**Failure handling.** **FAIL** if the key is missing, parse fails, or any of phase / resources / NPCs differs. Keep both JSON blobs and the diff. A successful in-session save that dies on refresh is still **FAIL**. If the PR is a save bug-fix, also run surface `pr-telemetry-required` (the events must exist; this step only proves the round-trip).

## Step 3 — Cooldown bar visibility

**Trigger.** Diff or claim touches cooldown UI, disabled-button styling, `paintCooldowns` / `.cd` / `div.cooldown`, gather/stoke/traps buttons, or a "no countdown" report.

**How to execute.** Trigger a cooldown with a real click. Read the overlay DOM and computed style immediately, then once more after a short wait. Screenshot.

```js
const btn = page.locator('button.adr', { hasText: '伐木' });
const box = await btn.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

const read = async () =>
  btn.evaluate((el) => {
    const overlay = el.querySelector('.cd, .cooldown');
    const cs = overlay ? getComputedStyle(overlay) : null;
    const btnCs = getComputedStyle(el);
    const countdown = el.querySelector('.cd-label, .countdown, [data-cd]');
    return {
      buttonHeight: el.getBoundingClientRect().height,
      overlayHeight: overlay ? overlay.getBoundingClientRect().height : 0,
      overlayWidthPct: overlay
        ? (overlay.getBoundingClientRect().width /
            el.getBoundingClientRect().width) *
          100
        : 0,
      overlayDisplay: cs?.display,
      buttonOpacity: Number(btnCs.opacity),
      countdownText: (countdown?.textContent || el.innerText).match(/\d+/)?.[0] ?? null,
    };
  });

const t0 = await read();
await page.waitForTimeout(800);
const t1 = await read();
await btn.screenshot({ path: 'artifacts/cooldown-bar.png' });
```

**Pass.** Overlay height equals button height (full-height overlay, not a 3px underline). Overlay width is visible and **shrinks** (`t1.overlayWidthPct < t0.overlayWidthPct`). Button opacity is `1` (the button is not faded out). A countdown number is shown. Screenshot captured.

**Failure handling.** **FAIL** on a 3px bar, a static width, opacity `< 1` on the button, or a missing number. Keep `t0`, `t1`, and the screenshot. Then run surface `verification-scope-mismatch`: enumerate every code path and confirm you measured the **live** one (`vercel.json` / build output / fetched asset), not a Godot scene script the deploy does not serve.

### Cooldown visibility (tab hide / `visibilitychange`)

**Trigger.** Same as step 3, plus any claim that a cooldown **restarts from the full duration** after switching tabs, hiding the page, or a `visibilitychange`.

**How to execute.** Start a real stoke (`添柴` / `生火`) cooldown. Snapshot remaining. Simulate a background tab: open another page and `bring_to_front`, or pause `requestAnimationFrame` and wait **N** seconds (CDP `Page.setWebLifecycleState` `frozen` if the runtime accepts it). Return to the game page, fire `visibilitychange` if the document did not hide on its own, then read remaining again.

```js
const btn = page.locator('button.adr[data-key="fire"]');
const box = await btn.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(300);

const before = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  const el = document.querySelector('button.adr[data-key="fire"]');
  const left = g.cooldownLeft ? g.cooldownLeft('stoke') : (g.state.cooldowns.stoke || 0);
  return {
    remaining: left,
    countdown: el.querySelector('.cd-sec')?.textContent || null,
    ends_at: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke,
  };
});

const hideN = 4;
await page.evaluate(() => {
  window.__adrRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function () { return 0; };
});
const other = await page.context().newPage();
await other.goto('about:blank');
await other.bringToFront();
await page.waitForTimeout(hideN * 1000);
await page.bringToFront();
await page.evaluate(() => {
  if (window.__adrRAF) window.requestAnimationFrame = window.__adrRAF;
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(250);

const after = await page.evaluate(() => {
  const g = window.__ADR_GAME;
  const el = document.querySelector('button.adr[data-key="fire"]');
  const left = g.cooldownLeft ? g.cooldownLeft('stoke') : (g.state.cooldowns.stoke || 0);
  return {
    remaining: left,
    countdown: el.querySelector('.cd-sec')?.textContent || null,
    ends_at: g.state.cooldown_ends_at && g.state.cooldown_ends_at.stoke,
  };
});
```

**Pass.** After N seconds away, remaining is **10 − N** (stoke), not reset to 10. Allow ±1.2s for click/setup slack. If **N ≥ 10**, the button is enabled again and the countdown is empty. `ends_at` is an absolute timestamp; `remaining` on `visibilitychange` / `cooldown_visibility` matches `ends_at − now`. Same rule for gather (60s) and traps (90s).

**Failure handling.** **FAIL** if remaining jumps back to the full duration (stoke 10 / gather 60 / traps 90) after the hide. Keep `before`, `after`, `hideN`, and the screenshot. Root cause to check first: `ui.js` rAF `dt` clamped with `Math.min(0.25, …)` plus `engine.js` decrementing remaining by `dt` instead of `end − now`.

## Step 4 — Telemetry write

**Trigger.** Diff or claim adds or changes `playtest_events`, a new `event_name`, payload fields, the flush path, or a bug-fix / data-question PR that must prove a row landed.

**How to execute.** Drive the live page with a unique session marker. Trigger the event. Wait for the flush. Query Supabase with a **service or read key from env**. The anon/public key is insert-only and must not be used for SELECT.

```js
const sessionId = await page.evaluate(() => {
  const id = crypto.randomUUID();
  localStorage.setItem('session_id', id);
  return id;
});
await page.click(coreButton); // real click that should emit the event
await page.waitForTimeout(15_000); // batch flush
```

```sql
-- run with SUPABASE_URL + service/read key (not the anon key)
SELECT session_id, event_name, occurred_at, game_time_sec, phase, payload
FROM playtest_events
WHERE session_id = :sessionId
ORDER BY occurred_at;
```

Confirm the anon key cannot SELECT (insert-only RLS).

**Pass.** At least one new row for this run's `session_id`. `event_name` matches the claim. Required payload fields are present. `occurred_at` is non-null and recent. `game_time_sec` / `phase` match the session. Anon SELECT is denied.

**Failure handling.** **FAIL** if no row, wrong `event_name` / fields, or a stale timestamp. `localStorage` alone is not a pass. **BLOCKED** if `SUPABASE_URL` or the service/read key is missing — do not fall back to anon SELECT. Then run surface `pr-telemetry-required` (problem, new event types+fields, verification query + landed rows). This step is the landed-row evidence; that surface is the merge judgment.

## Step 5 — Mapping: changed files → steps → surfaces

Select every matching row. A file can require more than one step and more than one surface. Steps feed surfaces; they do not replace them.

| Changed file types / keywords | Required steps | Surfaces the steps feed |
|---|---|---|
| `*.ttf` `*.otf` `*.woff` `*.woff2` `*font*` `@font-face` `font-family` `font-weight` `typography` | **1** font check | `aesthetic-community-consensus` (opened community threads). Step 1 proves the face loaded; the surface judges whether the choice is justified. |
| `*theme*` `*.css` `*.scss` UI color / palette (no font files) | **1** if type is involved; else none of 1–4 unless a visual claim names a face | `aesthetic-community-consensus` |
| save / load / `localStorage` / persist / refresh / `save_write` | **2** save and refresh | `pr-telemetry-required` when the PR is a save bug-fix. Persistence claim also needs the reload read-back in SKILL.md. |
| cooldown / `.cd` / `paintCooldowns` / disabled button / gather / stoke / traps UI | **3** cooldown bar **and** the tab-hide remaining check in the same step | `verification-scope-mismatch`: measure the code that **actually runs live**, not a sibling Godot/web path. |
| `playtest_events` / `event_name` / telemetry / analytics sink / flush | **4** telemetry write | `pr-telemetry-required` (bug-fix or data-question PR) and `<sink>-telemetry` (row read-back). |
| `tools/pacing_analyzer.py` / `@pacing` / early-phase timing | no checklist step — verify **auto-calls** the analyzer | `game-pacing-intent` **plus** `art-style-boredom-mitigation` (same `early_phase_slow` wait; style decides Rajan vs pixel mitigations) |
| `?style=` / `assets/pixel/` / art-style boredom | no extra Playwright step | `art-style-boredom-mitigation`: text → PASS; pixel → **NEEDS ALTERNATIVE** |
| unusual click frequency / cooldown-cap question (no UI CSS change) | no extra step beyond the session query the surface names | `behavior-timeline-vs-mechanics` |
| UI / render / interaction issue spanning Godot vs web, CSS vs canvas, or export targets | the step that matches the visible claim (**1**, **2**, **3**, **6**, **7**, **8**, or **9**), executed on the live path | `verification-scope-mismatch` first: identify the live path, then run the step there |
| UI / layout / CSS / responsive / visual-style / overlap / clipping | **6** plus **7** CDP layout, **8** screenshot diff, **9** a11y | `verification-scope-mismatch` (measure the live `godot/build/web` path), `aesthetic-community-consensus` when the claim is a style choice, and `original-intent-check` **before** proposing the change |
| save / load / `localStorage` / corrupt / wrong types / huge numbers / long notifications | **2** and **10** extremes | `pr-telemetry-required` when the PR is a save bug-fix (`save_corrupt`, `save_recover`) |
| UI / art / sprite / canvas / interaction proposal | no extra checklist step before the proposal is written | `original-intent-check`: original `file:line` + intent; conflict = art-direction choice, not a fix |
| game files / verify recipes / `tools/pacing_analyzer.py` opened against `dot-pi` or another non-game repo | no extra Playwright step | `wrong-repo-pr`: migrate to `liush2yuxjtu/adarkroom` and comment on the original PR |

**Rule.** A font change triggers step 1 **plus** `aesthetic-community-consensus`. A telemetry change triggers step 4 **plus** `pr-telemetry-required`. A UI/layout change triggers steps **6 + 7 + 8 + 9** **plus** `verification-scope-mismatch`. Save/corrupt/extremes trigger **2 + 10**. For `verification-scope-mismatch`, verify the code that actually runs live.

Skip a step only when its trigger does not match the diff. Record the skip. Do not invent measurements.

## Step 6 — Playwright multi-viewport UI audit

**Trigger.** Diff or claim touches UI, layout, CSS, responsive behavior, visual style, overlap, clipping, or any page a player sees at more than one size.

**How to execute.** Open the live page (or the local `godot/build/web` export when the change is not yet deployed) at **four** viewports, including **1024**. Use real Playwright, not a screenshot-only guess. Collect console errors and `requestfailed` on each size. Classify network noise before treating it as a product bug.

```js
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'narrow-desktop', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'fullhd', width: 1920, height: 1080 },
];

for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const consoleErrors = [];
  const failed = [];
  const posts = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failed.push({
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText || '',
    });
  });
  page.on('response', (res) => {
    if (res.request().method() === 'POST') {
      posts.push({ url: res.url(), status: res.status() });
    }
  });
  await page.goto(liveUrl, { waitUntil: 'networkidle' });

  const audit = await page.evaluate(() => {
    const issues = [];
    const minContrast = 4.5;
    const relLum = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const [r, g, b] = [m[1], m[2], m[3]].map((n) => {
        const s = Number(n) / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (fg, bg) => {
      const L1 = relLum(fg);
      const L2 = relLum(bg);
      if (L1 == null || L2 == null) return null;
      const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
      return (hi + 0.05) / (lo + 0.05);
    };
    const docW = document.documentElement.scrollWidth;
    const viewW = window.innerWidth;
    if (docW > viewW + 1) issues.push({ kind: 'horizontal-scroll', detail: `${docW} > ${viewW}` });
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.x < 0) issues.push({ kind: 'clip-x', el: el.tagName, x: r.x, text: (el.innerText || '').slice(0, 40) });
      const cs = getComputedStyle(el);
      if (el.matches('button, [role=button], a, input, select')) {
        if (r.width > 0 && (r.width < 44 || r.height < 44)) {
          issues.push({ kind: 'tap-target', el: el.tagName, w: r.width, h: r.height, text: (el.innerText || '').slice(0, 40) });
        }
      }
      const ratio = contrast(cs.color, cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : cs.backgroundColor);
      if (ratio != null && ratio < minContrast && (el.innerText || '').trim()) {
        issues.push({ kind: 'contrast', el: el.tagName, ratio: Number(ratio.toFixed(2)), text: el.innerText.slice(0, 40) });
      }
    }
    return issues;
  });

  await page.screenshot({ path: `artifacts/ui-audit-${vp.name}.png`, fullPage: true });
  await page.close();

  const abortedWithSuccess = failed.filter(
    (f) =>
      f.error === 'net::ERR_ABORTED' &&
      posts.some((p) => p.status >= 200 && p.status < 300)
  );
  const realFailures = failed.filter(
    (f) => !abortedWithSuccess.some((p) => p.url === f.url && p.error === f.error)
  );
  // record { vp, audit, consoleErrors, realFailures, abortedWithSuccess }
}
```

Check on each viewport:

- layout and spacing
- contrast (WCAG **4.5:1** for body/UI text)
- button / tap-target size (**≥44px**)
- alignment
- overlap / clipping (any element `x < 0`)
- horizontal scroll
- console errors and `requestfailed`, split into `realFailures` vs paired `ERR_ABORTED`+2xx

**Audit lessons** (from the 2026-10-12 12-issue run; apply every time):

1. **Include 1024.** 390 and 1920 alone miss the narrow-desktop clip. P0-1 (`#notifications` off-canvas) showed at 1280 and **≥1024**, not on phone or full-HD. Always run 1024×768 (or 1024×800) as well as 1280×800, 390×844, and 1920×1080.
2. **Distinguish `realFailures` vs paired `ERR_ABORTED`.** Chromium/Playwright records CORS preflight and `keepalive` POSTs as `requestfailed` / `net::ERR_ABORTED` even when the same URL returns **201**. Pair each abort with a 2xx POST → `abortedWithSuccess` (noise). Only unpaired failures are `realFailures`. P0-10 was this noise, not dropped rows; the product fix was a same-origin `/api/playtest_events` rewrite so the browser never leaves origin.
3. **Verify the verify-script URL first.** Before treating a network error as a product bug, confirm the audit script is hitting the live (or intended preview) URL — not a hardcoded stale preview, a typo'd query, or a script-local 404. A wrong script URL is a verifier bug, not a game FAIL.
4. **Stop rounds when no new issues.** Each audit/fix pass must produce a numbered delta. If a round finds no new issues (only known deferred IDs, or an empty new list), stop. Do not open another fix PR or re-audit loop for the same surface.

**Pass.** Numbered issue list written (empty list is allowed). One screenshot per viewport saved, **including 1024**. Issues triaged **P0–P5**. No untriaged finding. Console/`requestfailed` entries are classified (`realFailures` vs `abortedWithSuccess`) and either listed or explicitly waived with evidence. The verify script's URL was confirmed. No extra round after a clean (no-new-issues) pass.

**Failure handling.** **FAIL** if a viewport (including 1024) was skipped, screenshots are missing, issues are unnumbered, or severity is missing. **FAIL** if every `requestfailed` is treated as a product bug without pairing `ERR_ABORTED`+2xx. Keep the issue list and screenshots. Then run surface `verification-scope-mismatch` on the live path (`godot/build/web`, not a Godot scene script the deploy does not serve).

## Step 7 — CDP layout metrics (no page-JS DOM queries)

**Trigger.** Same as step 6, plus any overlap / clip / overflow / below-the-fold report. Always include `#btn-style` in the toolbar.

**How to execute.** Drive the live URL (or local `godot/build/web`) at widths **360, 390, 768, 1024, 1280, 1440, 1920**, both `?style=pixel` and `?style=text`. Measure with Playwright **CDPSession** only:

- `Page.getLayoutMetrics` — viewport, content size, scroll range
- `DOMSnapshot.captureSnapshot` with computed styles `font-size`, `color`, `background-color`, `z-index`, `display`, `visibility`
- `DOM.getBoxModel` / `DOM.querySelector` / `DOM.performSearch` — element boxes

Do **not** use `page.evaluate` / `getBoundingClientRect` for these numbers. Real-mouse click `生火` first so notes, scene, and stores exist.

```bash
node tools/verify/run.mjs --url <live> --only cdp
# or
node tools/verify/cdp-layout.mjs --url <live>
```

**Pass.** JSON `pass: true`. No horizontal overflow (`contentSize.width ≤ viewport`). No `#menu` (including `#btn-style`) overlapping notification cards, `.px-scene`, or `#stores`. No scene `x < 0`. `#app` width ≤ viewport. Pixel note cards show a full-text box (not a 72px clip of one glyph). `#notifications` is not below the fold. `'消息'` legend aligns with the card row. Toolbar at 360 does not leave `#btn-classic` alone on a wrap row. Exit 0.

**Failure handling.** **FAIL** (exit 1) on any occlusion/overflow/clip. Keep the JSON (`kind`, boxes, width, style). Then run `verification-scope-mismatch` on live `godot/build/web`.

## Step 8 — Screenshot diff (fixed widths, pixel vs text)

**Trigger.** UI / layout / CSS / visual-style diff, or a claim that a viewport looks right.

**How to execute.** Capture viewport PNGs at the seven widths × both styles. Diff against committed files in `tools/verify/baselines/{style}-{width}.png` with pixelmatch (`threshold` 0.12, max mismatched ratio 1.5%).

```bash
node tools/verify/run.mjs --url <live> --only screenshots
node tools/verify/screenshot-diff.mjs --update --url <live>   # rewrite baselines
```

**Pass.** Every width/style matches its baseline within the threshold. Missing baselines **FAIL** until `--update` is committed.

**Failure handling.** Write `artifacts/diffs/{style}-{width}.png`. Do not pass by eyeballing. Update baselines only after an intentional visual change.

## Step 9 — Accessibility (axe, contrast, tap, names, focus)

**Trigger.** UI controls, color, tap targets, or any a11y report.

**How to execute.** Inject axe-core. Compute WCAG contrast from CDP computed styles (**4.5:1** normal text, **3:1** large). Tap targets via `DOM.getBoxModel`: **≥44px** on widths ≤768, **≥24px** desktop — **always include `#btn-style`**. Flag missing accessible names. Tab through controls and require a visible focus ring (`outline` or `box-shadow`).

```bash
node tools/verify/run.mjs --url <live> --only a11y
```

**Pass.** No serious/critical axe violations. `#director-label` must not put `aria-label` on a generic span (needs an allowed `role`, or visible text only). `main` landmark and one `h1` present. `#director-label` contrast ≥ 4.5:1 (pixel 「规则」 must not be `#1c1612` on `#1c1612`). Text-style `添柴` height ≥ 44px on mobile.

**Failure handling.** **FAIL** with the axe rule id / contrast ratio / box. Skip `font-size:0` / `color:transparent` nodes (pixel icon chrome); still measure `.px-caption`, `.cd-sec`, `.px-note-text`, `#director-label`.

## Step 10 — Extreme cases (long text, zero, 1e9, corrupt saves)

**Trigger.** Save/load, notifications, stores, or any robustness claim.

**How to execute.** Load fixtures from `tools/verify/fixtures/saves/` (and generated blobs): very long CJK notification; all resources `0`; stores `1e9`; invalid JSON; missing `state`; wrong types (`stores` string, `notifications` object, `fire` string). Assert no uncaught errors, no horizontal overflow, no clipped text, graceful recovery.

```bash
node tools/verify/run.mjs --url <live> --only extremes
```

**Pass.** Game boots. `stores` stays an object, `notifications` an array, `fire` a number. 1e9 does **not** paint a thousand-pixel icon column; a numeric count is visible and icon stacks are capped. Corrupt saves emit `save_corrupt` **and** `save_recover` (not silent accept). Long pixel notes show the full sentence, not one category glyph.

**Failure handling.** **FAIL** (exit 1) if a wrong-type save is accepted with no `save_corrupt`, if notes vanish, or if 1e9 overflows. Keep the JSON and a screenshot under `tools/verify/artifacts/`.

The whole suite:

```bash
node tools/verify/run.mjs --url <live>
```

prints one JSON object `{ pass, exitCode, failures, suites, perWidth }` and exits **non-zero** on any failure.

## Worked example: 2026-10-12 12-issue audit

UI-fix [PR #7](https://github.com/liush2yuxjtu/adarkroom/pull/7), merged into live `cursor/godot-chinese-remake-5c3a` at `2361374` (`23613748bb349ec44147cb458eaf600f80bd03f6`). Live export `godot/build/web`. In-repo auditor `godot/tools/verify_uifix.mjs`. Screenshots `/opt/cursor/artifacts/uifix/`.

Twelve numbered issues. Six P0/P1 fixed in that PR; six P2–P5 deferred.

| ID | severity | finding | action |
|---|---|---|---|
| **P0-1** | P0 | 1280 / **≥1024**: `#notifications` clipped (`x<0` / off-canvas). 390 and 1920 alone missed it. | **fixed**: relative grid placement; bar visible at 1280 and ≥1024 |
| **P0-2** | P0 | No mobile layout: 390×844 horizontal scroll, no viewport meta | **fixed**: ≤768 single column + viewport meta, no horizontal scroll |
| **P0-10** | P0 | Playwright `requestfailed` on Supabase `playtest_events` POST looked like dropped telemetry | **not a product drop**: CORS preflight + `keepalive` produced paired `net::ERR_ABORTED` + **201**. Split `realFailures` vs `abortedWithSuccess`. **fixed** by same-origin `/api/playtest_events` rewrite in `vercel.json` (+ backoff retry + `failCount`). Anon INSERT already worked. |
| **P1-3** | P1 | Identical notifications spammed the list | **fixed**: consecutive identical notes merge as ×N; list cap 30 + fade |
| **P1-4** | P1 | Disabled / cooldown text failed WCAG 4.5:1 | **fixed**: text `#4a4a4a`, contrast **8.86:1** |
| **P1-8** | P1 | Mobile menu tap targets &lt;44px | **fixed**: `#menu button` min **44×44**, more spacing; keep reopen confirm |
| **P2-5** | P2 | Locked-tab opacity contrast | **deferred** |
| **P2-6** | P2 | Inventory box overlapping the tab line | **deferred** |
| **P3-7** | P3 | Renaming a tab squeezes later tabs | **deferred** |
| **P3-12** | P3 | Stale Noto Serif preload (other agent deleting) | **deferred** |
| **P4-11** | P4 | Widescreen whitespace | **deferred** |
| **P5-9** | P5 | Menu half-width / full-width punctuation | **deferred** |

Telemetry added on the same PR (`pr-telemetry-required`): `viewport_layout`, `notification_dedup`, `telemetry_send_fail`, `telemetry_retry_ok`. Session `93df3495-c911-4593-9243-0c226a401c71`: `viewport_layout` 8, `notification_dedup` 12, `player_action` 14, `failCount=0`.

These numbers are execution evidence for step 6. They feed `verification-scope-mismatch` (live `godot/build/web` + `vercel.json` rewrite) and `pr-telemetry-required` (new event types + landed rows). They do not collapse into a surface.

## Worked example: A Dark Room live verification (`5e3b891`)

This repo, branch `cursor/godot-chinese-remake-5c3a`, commit `5e3b891`. Vercel serves `godot/build/web` (HTML/JS: `ui.js`, `adr.css`), not `godot/scripts/ui/Main.gd`. In-repo verifier: this skill under `.cursor/skills/verify/` (or `.agents/skills/verify/`).

| step | live observation | verdict |
|---|---|---|
| **1** font | computed face Noto Serif SC, weight **500**, `document.fonts` status `"loaded"`, CJK sample has width and no U+FFFD | **PASS** (still run `aesthetic-community-consensus` on the choice) |
| **2** save/refresh | save key present; after reload, phase / resources / NPC JSON identical to the pre-reload snapshot | **PASS** |
| **3** cooldown bar | overlay **39px** tall (full button height), width about **93%** shortly after click and shrinking, button **opacity 1**, countdown number visible | **PASS** (this is the live `ui.js` + `adr.css` path; the Godot scene script is not live) |
| **4** telemetry | unique `session_id`; service/read-key SELECT returns the new `playtest_events` row | run when the diff touches events; anon SELECT must fail |

These numbers are execution evidence. They do not collapse into a surface. Step 3 feeds `verification-scope-mismatch` (live path identified). Step 1 feeds `aesthetic-community-consensus`. Step 4 feeds `pr-telemetry-required`.
