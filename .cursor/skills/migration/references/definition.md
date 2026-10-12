# Definition: original A Dark Room fully migrated

The remake is complete only when a player of the original can find every original system in the Chinese remake, with the same numbers and a working unlock path.

## Source of truth

Extracted every run from:

- `script/room.js` — Craftables (buildings, tools, upgrades, weapons), TradeGoods, MiscItems, craft notify strings
- `script/outside.js` — `_INCOME` workers and rates
- `script/world.js` — `TILE`, landmarks, `Weapons` (damage/cooldown/cost), world numeric constants
- `script/engine.js` — `Perks`
- `script/path.js` — embark / outfit (presence)
- `script/events/*.js` — titles for room, outside, global, marketing, encounters, setpieces, executioner
- `script/fabricator.js` — fabricator crafts
- `script/ship.js` / `script/space.js` — hull, thrusters, space constants
- `script/prestige.js` / `script/scoring.js` — carry-over stores and score factors
- `lang/zh_cn/strings.js` — required Chinese for every `_('…')` key

The extractor is `tools/verify/lib/original-extract.mjs`. Do not replace it with a handwritten inventory.

## Five checks per item

| check | pass | fail |
|---|---|---|
| present | remake defines the same entity (`godot/build/web`) | `missing` |
| numeric | costs / rates / damage / probabilities equal original | `mismatch` |
| reachable | a producer, buy, craft, event, or landmark yields it | `no_producer` or story fail |
| Chinese | remake label is CJK; key exists in `lang/zh_cn` | `no_zh` |
| persist | `createState` + `migrateState` keep the key on `adr.save.v1` | `no_save` |

The **review gate** (exit 0) is 0 missing, 0 no_producer, 0 numeric mismatch, plus per-batch reachability. Chinese and persist failures are also recorded on the suite so a reviewer cannot ignore them.

## Live path

Vercel serves `godot/build/web`. Unused Godot scripts are not evidence of migration.

## Additions vs cuts

Remake-only layers (rule/LLM director, playtest telemetry, pixel style, `slice_complete` milestone) are **additions**. They do not excuse dropping original content. Cuts are never implicit.
