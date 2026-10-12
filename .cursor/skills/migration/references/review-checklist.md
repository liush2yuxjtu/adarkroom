# Human judgment checklist

Run the machine gate first (`node tools/verify/run.mjs --only migration`). Then walk this list. A skipped box is not a PASS.

## 1. Inventory vs original

- [ ] Open the generated `tools/verify/reports/migration-baseline.md`.
- [ ] Confirm every category the definition lists appears (buildings, workers, crafts, trade, events, tiles, perks, weapons, ship/space, fabricator, executioner, ending/prestige/score, notifications).
- [ ] Spot-check 3 original files: pick one Craftable, one `_INCOME` row, one event title, and confirm the extractor named them.

## 2. Numbers

- [ ] For each `mismatch` row, open original `file` and remake `buildingCost` / `INCOME` / combat table.
- [ ] Scaling costs: compare n=0 and n=1 (trap 10/20, hut 100/150).
- [ ] Do **not** "fix" a mismatch by changing original-faithful remake numbers to new balance.

## 3. Reachability

- [ ] Batch 1 story: lodge, smokehouse, charcutier, `cured_meat > 0`, packed for embark.
- [ ] For batches 2–9, either a story/sandbox runner exists and passes, or the batch is listed incomplete (FAIL, expected until that batch lands).
- [ ] `no_producer` is not excused by "defined in ITEMS".

## 4. Chinese and saves

- [ ] Present items show Chinese in text style (and pixel captions where the style uses text).
- [ ] Old `adr.save.v1` blobs still load; new keys default via `migrateState`.

## 5. Allowlist and pacing

- [ ] `tools/verify/migration-allowlist.json` `entries` is empty, **or** every entry has `id` + `reason` and was approved as an exception, not a silent cut.
- [ ] Early slow pacing still intentional: gather 60s, stoke 10s, builder 30s, trap 90s untouched.
- [ ] Analyzer `early_phase_slow` is an intent question, never a bug to "fix" by speeding the opening.

## 6. Default suites

- [ ] `node tools/verify/run.mjs` (default list) still PASSes. Migration FAIL must not be "fixed" by skipping story/income/cdp.
