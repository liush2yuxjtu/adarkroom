# Content parity with the original A Dark Room

Policy (user, 2026-10-12): the remake must keep **all** original content. Nothing is an intentional cut,
so `WHITELIST` in `tools/verify/parity.mjs` stays empty.

```bash
node tools/verify/parity.mjs                     # JSON, exit 1 if any original entry is not present
node tools/verify/parity.mjs --md parity.md      # full table with remake file:line
node tools/verify/run.mjs --only parity
```

Source of truth is extracted from the original code each run (no hand list):
`script/room.js` Craftables (building vs tool/upgrade/weapon), MiscItems, TradeGoods; `script/outside.js`
`_INCOME`; `script/world.js` Weapons and TILE landmarks; `script/fabricator.js`; `script/events/*.js`
titles (room, outside, global, marketing, encounters, setpieces, executioner); later phases ship/space/
fabricator/ending.

Statuses: `present` (defined and produced/reachable), `no_producer` (defined and maybe consumed, nothing
yields it, e.g. `cured_meat`), `missing`.

`parity` is opt-in in `run.mjs` (not in the default list) while gaps remain, so the UI/telemetry gate stays
usable; promote it to default once it passes. Any change that adds original content must flip rows to
`present` here.
