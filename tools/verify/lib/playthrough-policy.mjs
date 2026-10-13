/**
 * Shared late-game playthrough policy for remake (engine.js) and classic timing model.
 * Stages: village economy → forest/gather → world/outfit → combat → ship/space
 * → fabricator → dungeon/ending → prestige.
 */
export const STAGES = [
  "room_fire",
  "stranger",
  "forest",
  "village",
  "village_econ",
  "path",
  "world",
  "combat",
  "mines",
  "dungeon",
  "ship",
  "fabricator",
  "space",
  "ending",
  "prestige"
];

export function landmarkKey(landmarks, id) {
  if (!landmarks) return null;
  const hit = Object.entries(landmarks).find(([, v]) => v === id);
  return hit ? hit[0] : null;
}

export function parseXY(key) {
  if (!key) return null;
  const [x, y] = String(key).split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function stepToward(from, to) {
  if (!from || !to) return null;
  if (from.x < to.x) return { dx: 1, dy: 0 };
  if (from.x > to.x) return { dx: -1, dy: 0 };
  if (from.y < to.y) return { dx: 0, dy: 1 };
  if (from.y > to.y) return { dx: 0, dy: -1 };
  return null;
}

export function pathHome(world) {
  const home = world && world.size > 20 ? { x: 30, y: 30 } : { x: 5, y: 5 };
  return home;
}

/** Classic constants (script/room.js, script/outside.js, script/world.js, script/ship.js). */
export const CLASSIC = {
  gatherDelay: 60,
  trapDelay: 90,
  stokeCooldown: 10,
  builderArrive: 30,
  outsideUnlock: 15,
  popMin: 30,
  popSpan: 150,
  hutRoom: 4,
  buildingCost: {
    trap: (n) => ({ wood: 10 + n * 10 }),
    cart: () => ({ wood: 30 }),
    hut: (n) => ({ wood: 100 + n * 50 }),
    lodge: () => ({ wood: 200, fur: 10, meat: 5 }),
    trading_post: () => ({ wood: 400, fur: 100 }),
    tannery: () => ({ wood: 500, fur: 50 }),
    smokehouse: () => ({ wood: 600, meat: 50 }),
    workshop: () => ({ wood: 800, leather: 100, scales: 10 }),
    steelworks: () => ({ wood: 1500, iron: 100, coal: 100 }),
    armoury: () => ({ wood: 3000, steel: 100, sulphur: 50 })
  },
  income: {
    gatherer: { delay: 10, stores: { wood: 1 } },
    hunter: { delay: 10, stores: { fur: 0.5, meat: 0.5 } },
    tanner: { delay: 10, stores: { fur: -5, leather: 1 } },
    charcutier: { delay: 10, stores: { meat: -5, wood: -5, cured_meat: 1 } },
    iron_miner: { delay: 10, stores: { cured_meat: -1, iron: 1 } },
    coal_miner: { delay: 10, stores: { cured_meat: -1, coal: 1 } },
    sulphur_miner: { delay: 10, stores: { cured_meat: -1, sulphur: 1 } },
    steelworker: { delay: 10, stores: { iron: -1, coal: -1, steel: 1 } },
    armourer: { delay: 10, stores: { steel: -1, sulphur: -1, bullets: 1 } }
  },
  worldRadius: 30,
  shipHullAlloy: 1,
  spaceAltitude: 60,
  cites: {
    lodge: "script/room.js:59-74",
    tannery: "script/room.js:90-104",
    smokehouse: "script/room.js:105-119",
    workshop: "script/room.js:120-135",
    income: "script/outside.js:13-95",
    world: "script/world.js:1-150",
    ship: "script/ship.js:1-80",
    space: "script/space.js:1-100",
    fabricator: "script/fabricator.js:1-80",
    prestige: "script/prestige.js:1-80"
  }
};
