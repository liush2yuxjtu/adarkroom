# Migration batches

Batch 1 landed on `main` (village economy). Remaining original gaps are grouped 2–9 so each PR can flip a bounded set of extractor rows to `present`.

| id | title | typical original sources |
|---|---|---|
| core | Early room / forest slice | trap, cart, hut, gatherer, wood/fur/meat, compass event, punch, path/outfit, old house |
| 1 | Village economy | lodge–armoury; hunter/trapper/tanner/charcutier/miners/steelworker/armourer; leather, cured meat, iron, coal, steel, sulphur |
| 2 | Workshop crafts | torch, waterskin, cask, water tank, bone spear, rucksack, wagon, convoy, l/i/s armour, iron/steel sword, rifle |
| 3 | Trading-post buy menu | TradeGoods (scales, teeth, iron, coal, steel, medicine, bullets, energy cell, bolas, grenade, bayonet, alien alloy) |
| 4 | Village / room events | `script/events/room.js`, `outside.js`, `global.js`, `marketing.js` |
| 5 | World combat | encounters, `Weapons`, `Perks`, TILE terrain, world constants (RADIUS, FIGHT_CHANCE, heals) |
| 6 | Landmarks / setpieces | mines, cave, town, city, outpost, ship wreck, borehole, battlefield, swamp, cache, setpiece events |
| 7 | Ship / space | `script/ship.js`, `script/space.js` |
| 8 | Fabricator | `script/fabricator.js`, blueprints, laser rifle as misc |
| 9 | Ending | executioner, prestige `storesMap`, `Score` factors |

Assignment lives in `batchOf()` in `tools/verify/lib/original-extract.mjs` so the report and the skill cannot drift.
