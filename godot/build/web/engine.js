/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * Remake of A Dark Room — Michael Townsend / doublespeak games. */
(function (root, factory) {
  var adr = factory();
  if (typeof module === "object" && module.exports) module.exports = adr;
  if (root) root.ADR = adr;
  return adr;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ITEMS = [
    "wood", "fur", "meat", "scales", "teeth", "cloth", "bait", "charm", "compass", "cured_meat",
    "leather", "iron", "coal", "sulphur", "steel", "bullets", "alien_alloy", "energy_cell",
    "torch", "waterskin", "cask", "water_tank", "bone_spear", "rucksack", "wagon", "convoy",
    "l_armour", "i_armour", "s_armour", "iron_sword", "steel_sword", "rifle", "bayonet",
    "laser_rifle", "grenade", "bolas", "medicine", "energy_blade", "fluid_recycler",
    "cargo_drone", "kinetic_armour", "disruptor", "hypo", "stim", "plasma_rifle"
  ];
  var AREAS = ["room", "outside", "path", "world", "ship", "space", "fabricator"];
  var NPCS = ["builder", "nomad", "villagers"];
  var MOODS = ["unknown", "collapsed", "shivering", "sleeping", "helping", "neutral", "wary", "grateful"];
  var FIRE = ["熄灭了", "开始冒烟", "冒出火苗", "燃烧着", "熊熊燃烧"];
  var TEMP = ["寒冷刺骨", "很冷", "很宜人", "暖和", "很热"];
  var ITEM_CN = {
    wood: "木头", fur: "毛皮", meat: "肉", scales: "鳞片", teeth: "牙齿",
    cloth: "布料", bait: "诱饵", charm: "符咒", compass: "罗盘", cured_meat: "熏肉",
    leather: "皮革", iron: "铁", coal: "煤", sulphur: "硫磺", steel: "钢",
    bullets: "子弹", alien_alloy: "外星合金", energy_cell: "能量电池",
    torch: "火把", waterskin: "水壶", cask: "水桶", water_tank: "水罐",
    bone_spear: "骨枪", rucksack: "双肩包", wagon: "篷车", convoy: "车队",
    l_armour: "皮甲", i_armour: "铁甲", s_armour: "钢甲",
    iron_sword: "铁剑", steel_sword: "钢剑", rifle: "步枪", bayonet: "刺刀",
    laser_rifle: "激光步枪", grenade: "手雷", bolas: "套索", medicine: "药品",
    energy_blade: "能量刃", fluid_recycler: "流体回收器", cargo_drone: "货运无人机",
    kinetic_armour: "动能装甲", disruptor: "扰乱器", hypo: "注射剂", stim: "兴奋剂",
    plasma_rifle: "等离子步枪"
  };
  var BUILDING_CN = {
    trap: "陷阱", cart: "货车", hut: "小屋", lodge: "狩猎小屋",
    trading_post: "贸易站", tannery: "制革屋", smokehouse: "熏肉房",
    workshop: "工坊", steelworks: "炼钢坊", armoury: "军械坊"
  };
  var WORKER_CN = {
    gatherer: "伐木者", hunter: "猎人", trapper: "捕兽者", tanner: "制革匠",
    charcutier: "熏肉匠", iron_miner: "铁矿工", coal_miner: "煤矿工",
    sulphur_miner: "硫矿工", steelworker: "炼钢工", armourer: "军械匠"
  };
  var BUILDING_MAX = {
    trap: 10, cart: 1, hut: 20, lodge: 1, trading_post: 1,
    tannery: 1, smokehouse: 1, workshop: 1, steelworks: 1, armoury: 1
  };
  var BUILDING_MSG = {
    trap: "more traps to catch more creatures",
    cart: "the rickety cart will carry more wood from the forest",
    hut: "builder puts up a hut, out in the forest. says word will get around.",
    lodge: "the hunting lodge stands in the forest, a ways out of town",
    trading_post: "now the nomads have a place to set up shop, they might stick around a while",
    tannery: "tannery goes up quick, on the edge of the village",
    smokehouse: "builder finishes the smokehouse. she looks hungry.",
    workshop: "workshop's finally ready. builder's excited to get to it",
    steelworks: "a haze falls over the village as the steelworks fires up",
    armoury: "armoury's done, welcoming back the weapons of the past."
  };
  var WORKER_JOBS = {
    gatherer: { delay: 10, stores: { wood: 1 }, need: null },
    hunter: { delay: 10, stores: { fur: 0.5, meat: 0.5 }, need: "lodge" },
    trapper: { delay: 10, stores: { meat: -1, bait: 1 }, need: "lodge" },
    tanner: { delay: 10, stores: { fur: -5, leather: 1 }, need: "tannery" },
    charcutier: { delay: 10, stores: { meat: -5, wood: -5, cured_meat: 1 }, need: "smokehouse" },
    iron_miner: { delay: 10, stores: { cured_meat: -1, iron: 1 }, needFlag: "cleared_iron_mine" },
    coal_miner: { delay: 10, stores: { cured_meat: -1, coal: 1 }, needFlag: "cleared_coal_mine" },
    sulphur_miner: { delay: 10, stores: { cured_meat: -1, sulphur: 1 }, needFlag: "cleared_sulphur_mine" },
    steelworker: { delay: 10, stores: { iron: -1, coal: -1, steel: 1 }, need: "steelworks" },
    armourer: { delay: 10, stores: { steel: -1, sulphur: -1, bullets: 1 }, need: "armoury" }
  };
  var CRAFTABLES = {
    torch: { type: "tool", cost: { wood: 1, cloth: 1 }, msg: "a torch to keep the dark away" },
    waterskin: { type: "upgrade", max: 1, cost: { leather: 50 }, msg: "this waterskin'll hold a bit of water, at least" },
    cask: { type: "upgrade", max: 1, cost: { leather: 100, iron: 20 }, msg: "the cask holds enough water for longer expeditions" },
    water_tank: { type: "upgrade", max: 1, cost: { iron: 100, steel: 50 }, msg: "never go thirsty again" },
    bone_spear: { type: "weapon", cost: { wood: 100, teeth: 5 }, msg: "this spear's not elegant, but it's pretty good at stabbing" },
    rucksack: { type: "upgrade", max: 1, cost: { leather: 200 }, msg: "carrying more means longer expeditions to the wilds" },
    wagon: { type: "upgrade", max: 1, cost: { wood: 500, iron: 100 }, msg: "the wagon can carry a lot of supplies" },
    convoy: { type: "upgrade", max: 1, cost: { wood: 1000, iron: 200, steel: 100 }, msg: "the convoy can haul mostly everything" },
    l_armour: { type: "upgrade", max: 1, cost: { leather: 200, scales: 20 }, msg: "leather's not strong. better than rags, though." },
    i_armour: { type: "upgrade", max: 1, cost: { leather: 200, iron: 100 }, msg: "iron's stronger than leather" },
    s_armour: { type: "upgrade", max: 1, cost: { leather: 200, steel: 100 }, msg: "steel's stronger than iron" },
    iron_sword: { type: "weapon", cost: { wood: 200, leather: 50, iron: 20 }, msg: "sword is sharp. good protection out in the wilds." },
    steel_sword: { type: "weapon", cost: { wood: 500, leather: 100, steel: 20 }, msg: "the steel is strong, and the blade true." },
    rifle: { type: "weapon", cost: { wood: 200, steel: 50, sulphur: 50 }, msg: "black powder and bullets, like the old days." }
  };
  var FABRICATOR_CRAFTS = {
    energy_blade: { cost: { alien_alloy: 1 }, msg: "the blade hums, charged particles sparking and fizzing." },
    fluid_recycler: { cost: { alien_alloy: 2 }, max: 1, msg: "water out, water in. waste not, want not." },
    cargo_drone: { cost: { alien_alloy: 2 }, max: 1, msg: "the workhorse of the wanderer fleet." },
    kinetic_armour: { cost: { alien_alloy: 2 }, max: 1, needFlag: "blueprint_kinetic_armour", msg: "wanderer soldiers succeed by subverting the enemy's rage." },
    disruptor: { cost: { alien_alloy: 1 }, needFlag: "blueprint_disruptor", msg: "sometimes it is best not to fight." },
    hypo: { cost: { alien_alloy: 1 }, qty: 5, needFlag: "blueprint_hypo", msg: "a handful of hypos. life in a vial." },
    stim: { cost: { alien_alloy: 1 }, needFlag: "blueprint_stim", msg: "sometimes it is best to fight without restraint." },
    plasma_rifle: { cost: { alien_alloy: 1 }, needFlag: "blueprint_plasma_rifle", msg: "the peak of wanderer weapons technology, sleek and deadly." }
  };
  var WEAPONS = {
    fists: { dmg: 1, type: "unarmed" },
    bone_spear: { dmg: 2, type: "melee" },
    iron_sword: { dmg: 4, type: "melee" },
    steel_sword: { dmg: 6, type: "melee" },
    bayonet: { dmg: 8, type: "melee" },
    energy_blade: { dmg: 10, type: "melee" },
    rifle: { dmg: 5, type: "ranged", cost: { bullets: 1 } },
    laser_rifle: { dmg: 8, type: "ranged", cost: { energy_cell: 1 } },
    plasma_rifle: { dmg: 12, type: "ranged", cost: { energy_cell: 1 } },
    grenade: { dmg: 15, type: "ranged", cost: { grenade: 1 } }
  };
  var WORLD_SIZE = 61;
  var WORLD_HOME = { x: 30, y: 30 };
  var DEFAULT_LANDMARKS = {
    "33,28": "old_house",
    "35,30": "iron_mine",
    "30,20": "coal_mine",
    "30,10": "sulphur_mine",
    "30,2": "crashed_ship",
    "45,22": "dungeon",
    "48,35": "ruined_city",
    "18,42": "battlefield"
  };
  var TOOL_NAMES = ["spawn_event", "give_item", "change_npc_mood", "narrate", "unlock_area", "set_flag"];

  var STRINGS = {
    "A Dark Room": "小黑屋",
    "A Firelit Room": "生火间",
    "light fire": "生火",
    "stoke fire": "添柴",
    "the room is {0}": "房间{0}",
    "the fire is {0}": "火堆{0}",
    "not enough wood to get the fire going": "木头不够生火了",
    "the wood has run out": "木头用光了",
    "the light from the fire spills from the windows, out into the dark": "火光映出窗外，投入黑暗之中",
    "builder stokes the fire": "建造者添了柴火",
    "the wind howls outside": "屋外寒风呼啸",
    "the wood is running out": "木头就快烧完了",
    "a ragged stranger stumbles through the door and collapses in the corner": "一个衣衫褴褛的陌生人步履蹒跚地步入门来，瘫倒在角落里",
    "the stranger shivers, and mumbles quietly. her words are unintelligible.": "陌生人瑟瑟发抖，呢喃不已，听不清在说些什么",
    "the stranger in the corner stops shivering. her breathing calms.": "角落里的陌生人不再颤抖了，她的呼吸平静了下来",
    "the stranger is standing by the fire. she says she can help. says she builds things.": "那名陌生人站在火堆旁。她说她可以帮忙。她说她会建东西",
    "builder just shivers": "建造者还在瑟瑟发抖",
    "build:": "建筑物:",
    "stores": "库存",
    "Room": "房间",
    "Outside": "野外",
    "A Silent Forest": "静寂森林",
    "gather wood": "伐木",
    "dry brush and dead branches litter the forest floor": "林地上散落着枯枝败叶",
    "check traps": "查看陷阱",
    "the traps contain ": "陷阱捕获到",
    "forest": "树林",
    "village": "村落",
    "pop ": "人口 ",
    "A Lonely Hut": "孤独小屋",
    "A Tiny Village": "小型村落",
    "A Modest Village": "中型村落",
    "A Large Village": "大型村落",
    "A Raucous Village": "喧嚣小镇",
    "the sky is grey and the wind blows relentlessly": "天色阴沉，风无情地刮着",
    "builder says she can make traps to catch any creatures might still be alive out there": "建造者说她能够制作陷阱来捕捉那些仍在野外活动的野兽",
    "more traps to catch more creatures": "陷阱越多，抓到的猎物就越多",
    "more traps won't help now": "再增加陷阱已毫无裨益",
    "builder says she can make a cart for carrying wood": "建造者说她能够制造出货车，用来运载木头",
    "the rickety cart will carry more wood from the forest": "摇摇晃晃的货车满载从森林运出的木头",
    "builder says there are more wanderers. says they'll work, too.": "建造者说这里有许多流浪者，他们也会来工作",
    "builder puts up a hut, out in the forest. says word will get around.": "建造者在林中建起一栋小屋，她说消息很快就会流传出去",
    "A Dusty Path": "漫漫尘途",
    "embark": "出发",
    "supplies:": "供应:",
    "the compass points east": "罗盘指向东方",
    "A Barren World": "荒芜世界",
    "the world fades": "眼前的世界烟消云散",
    "water replenished": "水补充好了",
    "dangerous to be this far from the village without proper protection": "没有妥善防护离开村子，远行很危险",
    "safer here": "这里可算安全了",
    "starvation sets in": "饥饿袭来",
    "the meat has run out": "肉已经吃完了",
    "there is no more water": "水已耗尽",
    "the thirst becomes unbearable": "口渴难耐",
    "*** EVENT ***": "*** 消息 ***",
    "a stranger arrives in the night": "陌生人在夜里抵达",
    "and": "以及",
    "the hunting lodge stands in the forest, a ways out of town": "狩猎小屋已经矗立在林中，距离村子不远",
    "now the nomads have a place to set up shop, they might stick around a while": "现在游牧部落有地方安营扎寨设立商铺了，他们也许会多逗留一段时间",
    "tannery goes up quick, on the edge of the village": "制革屋很快在村子一角建立了起来",
    "builder finishes the smokehouse. she looks hungry.": "建造者造好了熏肉房。她看起来饥肠辘辘。",
    "workshop's finally ready. builder's excited to get to it": "工坊终于建好了，建造者激动不已",
    "a haze falls over the village as the steelworks fires up": "炼钢坊开工后，一缕黑烟飘向村庄上空",
    "armoury's done, welcoming back the weapons of the past.": "军械坊建好了，欢迎使用这些过时的武器",
    "An Old Starship": "破旧星舰",
    "reinforce hull": "加固船身",
    "upgrade engine": "升级引擎",
    "lift off": "升空",
    "hull:": "外壳:",
    "not enough alien alloy": "外星合金不足",
    "Fabricator": "装配机"
  };

  function t(key) {
    return STRINGS[key] || key;
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function emptyStores() {
    var s = {};
    ITEMS.forEach(function (k) { s[k] = 0; });
    return s;
  }

  function emptyIncomeAcc() {
    var a = { builder: 0 };
    Object.keys(WORKER_JOBS).forEach(function (k) { a[k] = 0; });
    return a;
  }

  function createState() {
    return {
      session_id: (typeof ADRTelemetry !== "undefined" && ADRTelemetry.sessionId) ? ADRTelemetry.sessionId() : uuid(),
      started_at: Date.now(),
      game_time_sec: 0,
      fire: 0,
      temperature: 0,
      builder_level: -1,
      npc_moods: { builder: "unknown", nomad: "neutral", villagers: "neutral" },
      stores: emptyStores(),
      wood_initialized: false,
      buildings: {
        trap: 0, cart: 0, hut: 0, lodge: 0, trading_post: 0,
        tannery: 0, smokehouse: 0, workshop: 0, steelworks: 0, armoury: 0
      },
      population: 0,
      workers: {
        gatherer: 0, hunter: 0, trapper: 0, tanner: 0, charcutier: 0,
        iron_miner: 0, coal_miner: 0, sulphur_miner: 0, steelworker: 0, armourer: 0
      },
      unlocked: { room: true, outside: false, path: false, world: false, ship: false, space: false, fabricator: false },
      location: "room",
      phase: "room_dark",
      flags: {},
      notifications: [],
      cooldowns: {},
      cooldown_ends_at: {},
      income_acc: emptyIncomeAcc(),
      pop_timer: null,
      event_timer: null,
      scheduled: [],
      active_event: null,
      combat: null,
      outfit: { meat: 0, cured_meat: 0 },
      world: {
        on_expedition: false,
        size: WORLD_SIZE,
        x: WORLD_HOME.x,
        y: WORLD_HOME.y,
        water: 10,
        max_water: 10,
        hp: 10,
        max_hp: 10,
        food_moves: 0,
        visited: {},
        landmarks: Object.assign({}, DEFAULT_LANDMARKS),
        seen_danger: false
      },
      ship: { hull: 0, thrusters: 1 },
      space: { altitude: 0, x: 0, hull: 0, max_hull: 0, done: false },
      prestige: { stores: null, score: 0, runs: 0 },
      slice_complete: false,
      ending_reached: false,
      goal: null
    };
  }

  var SAVE_KEY = "adr.save.v1";
  var SAVE_VERSION = 1;
  var OBJECT_KEYS = ["stores", "buildings", "unlocked", "npc_moods", "workers", "outfit", "income_acc", "world", "flags", "cooldowns", "cooldown_ends_at", "ship", "space", "prestige"];
  var ARRAY_KEYS = ["notifications", "scheduled"];
  var NUMBER_KEYS = ["fire", "temperature", "game_time_sec", "builder_level", "population"];

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function validateStateShape(saved) {
    var issues = [];
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return { ok: false, issues: ["state"] };
    }
    OBJECT_KEYS.forEach(function (k) {
      if (saved[k] !== undefined && !isPlainObject(saved[k])) issues.push(k);
    });
    ARRAY_KEYS.forEach(function (k) {
      if (saved[k] !== undefined && !Array.isArray(saved[k])) issues.push(k);
    });
    NUMBER_KEYS.forEach(function (k) {
      if (saved[k] !== undefined && typeof saved[k] !== "number") issues.push(k);
    });
    return { ok: issues.length === 0, issues: issues };
  }

  function readSaveRaw(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    if (typeof localStorage === "undefined") return null;
    var raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      if (!silent && typeof ADRSaveTelemetry !== "undefined") {
        ADRSaveTelemetry.onSaveLoad({ ok: false, backend: "localStorage", error: "missing", size: 0 });
      }
      return null;
    }
    var tel = (!silent && typeof ADRSaveTelemetry !== "undefined") ? ADRSaveTelemetry : null;
    var check = tel
      ? tel.validateBlob(raw, { maxVersion: SAVE_VERSION, require: ["v", "state"] })
      : null;
    var doc = check ? check.value : null;
    if (!check) {
      try { doc = JSON.parse(raw); } catch (e) { doc = null; }
    }
    if ((check && !check.ok) || !doc || doc.v !== SAVE_VERSION || !doc.state || typeof doc.state !== "object" || Array.isArray(doc.state)) {
      var reason = (check && check.reason) || (!doc ? "json" : "schema");
      if (tel) {
        tel.onSaveCorrupt({
          reason: reason,
          raw: raw,
          backend: "localStorage",
          error: check && check.error,
          save_id: doc && (doc.save_id || (doc.state && doc.state.session_id)),
          fallback: "new_game"
        });
        tel.onSaveLoad({ ok: false, backend: "localStorage", error: reason, size: raw.length });
      }
      return null;
    }
    var shape = validateStateShape(doc.state);
    if (!shape.ok) {
      if (tel) {
        tel.onSaveCorrupt({
          reason: "wrong_types",
          raw: raw,
          backend: "localStorage",
          error: shape.issues.join(","),
          save_id: doc.save_id || (doc.state && doc.state.session_id),
          fallback: "sanitize"
        });
      }
    }
    if (tel) {
      var loadedId = doc.save_id || (doc.state && doc.state.session_id) || null;
      if (loadedId && typeof ADRTelemetry !== "undefined") {
        if (ADRTelemetry.setSessionId) ADRTelemetry.setSessionId(loadedId);
        else if (ADRTelemetry._state) ADRTelemetry._state.sessionId = loadedId;
      }
      tel.onSaveLoad({
        ok: true,
        backend: "localStorage",
        size: raw.length,
        save_id: loadedId,
        save_version: doc.v,
        checksum: doc.checksum || (check && check.checksum),
        phase: doc.state.phase,
        play_time_sec: doc.state.game_time_sec,
        saved_at: doc.saved_at
      });
    }
    return doc;
  }

  function writeSave(state) {
    if (typeof localStorage === "undefined") return;
    var t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      var doc = {
        v: SAVE_VERSION,
        save_id: state.session_id,
        saved_at: new Date().toISOString(),
        state: deepClone(state)
      };
      var tel = typeof ADRSaveTelemetry !== "undefined" ? ADRSaveTelemetry : null;
      if (tel && tel.checksum) {
        doc.checksum = tel.checksum(JSON.stringify({ v: doc.v, save_id: doc.save_id, saved_at: doc.saved_at, state: doc.state }));
      }
      var raw = JSON.stringify(doc);
      localStorage.setItem(SAVE_KEY, raw);
      if (tel) {
        tel.onSaveWrite({
          save_id: state.session_id,
          save_version: SAVE_VERSION,
          write_ms: Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0) * 100) / 100,
          backend: "localStorage",
          size: raw.length,
          checksum: doc.checksum || null,
          state: state
        });
      }
    } catch (e) { /* quota / private mode */ }
  }

  function clearSave() {
    if (typeof localStorage === "undefined") return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function hydrateState(saved) {
    var base = createState();
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return base;
    var shape = validateStateShape(saved);
    if (!shape.ok && typeof ADRTelemetry !== "undefined" && ADRTelemetry.log) {
      ADRTelemetry.log("save_recover", {
        reason: "wrong_types",
        fields: shape.issues,
        fallback: "sanitize"
      });
    }
    Object.keys(base).forEach(function (k) {
      if (saved[k] === undefined) return;
      if (OBJECT_KEYS.indexOf(k) >= 0) {
        if (!isPlainObject(saved[k])) return;
        base[k] = Object.assign({}, base[k], saved[k]);
        if (k === "world") {
          base.world.visited = (saved.world && saved.world.visited) || {};
          var lm = (saved.world && saved.world.landmarks) || {};
          if (!lm["33,28"] && (lm["8,3"] === "old_house" || saved.world.size === 11)) {
            base.world.size = WORLD_SIZE;
            base.world.landmarks = Object.assign({}, DEFAULT_LANDMARKS);
            if (saved.world.x === 5 && saved.world.y === 5) {
              base.world.x = WORLD_HOME.x;
              base.world.y = WORLD_HOME.y;
            }
          } else {
            base.world.landmarks = Object.keys(lm).length ? lm : base.world.landmarks;
          }
        }
      } else if (ARRAY_KEYS.indexOf(k) >= 0) {
        base[k] = Array.isArray(saved[k]) ? saved[k] : base[k];
      } else if (NUMBER_KEYS.indexOf(k) >= 0) {
        var n = Number(saved[k]);
        if (Number.isFinite(n)) base[k] = n;
      } else if (typeof base[k] === "boolean") {
        if (typeof saved[k] === "boolean") base[k] = saved[k];
      } else {
        base[k] = saved[k];
      }
    });
    base.phase = derivePhase(base);
    adoptCooldowns(base, 1);
    return base;
  }

  function decodeImport(b64) {
    if (!b64) return null;
    try {
      var pad = b64.replace(/-/g, "+").replace(/_/g, "/");
      while (pad.length % 4) pad += "=";
      var json = typeof atob === "function" ? atob(pad) : Buffer.from(pad, "base64").toString("utf8");
      var doc = JSON.parse(json);
      if (doc && doc.state) return hydrateState(doc.state);
      return hydrateState(doc);
    } catch (e) {
      return null;
    }
  }

  function telemetryBuffer() {
    if (typeof localStorage === "undefined") return [];
    try {
      var parsed = JSON.parse(localStorage.getItem("adr.telemetry") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function rebuildFromTelemetry(sessionId) {
    var evs = telemetryBuffer().filter(function (e) { return e && e.session_id === sessionId; });
    if (!evs.length) return null;
    evs.sort(function (a, b) {
      return String(a.occurred_at || "").localeCompare(String(b.occurred_at || ""));
    });
    var state = createState();
    state.session_id = sessionId;
    evs.forEach(function (e) {
      if (typeof e.game_time_sec === "number") state.game_time_sec = e.game_time_sec;
      var p = e.payload || {};
      if (e.event_name === "resource_snapshot") {
        if (p.stores) Object.assign(state.stores, p.stores);
        if (p.buildings) Object.assign(state.buildings, p.buildings);
        if (p.fire != null) state.fire = p.fire;
        if (p.population != null) state.population = p.population;
        if ((state.stores.wood || 0) > 0 || state.fire > 0) state.wood_initialized = true;
      }
      if (e.event_name === "player_action") {
        var act = p.action;
        if (act === "gather_wood" || act === "check_traps" || act === "build") state.unlocked.outside = true;
        if (act === "embark" || act === "world_move") {
          state.unlocked.path = true;
          state.unlocked.world = true;
        }
        if (act === "travel" && p.args && p.args.area) {
          if (p.args.area === "outside") state.unlocked.outside = true;
          if (p.args.area === "path") state.unlocked.path = true;
          state.location = p.args.area;
        }
      }
      if (e.event_name === "director_tool") {
        if (p.tool === "unlock_area" && p.args && p.args.area) state.unlocked[p.args.area] = true;
        if (p.tool === "set_flag" && p.args && p.args.key != null) {
          state.flags[p.args.key] = p.args.value;
          if (p.args.key === "builder_level" && typeof p.args.value === "number") {
            state.builder_level = p.args.value;
          }
        }
        if (p.tool === "change_npc_mood" && p.args && p.args.npc) {
          state.npc_moods[p.args.npc] = p.args.mood;
        }
        if (p.tool === "narrate" && p.args && p.args.text) {
          pushNote(state, p.args.text, p.args.source);
        }
      }
      if (e.event_name === "slice_complete") state.slice_complete = true;
    });
    if (state.unlocked.outside && state.builder_level < 1) state.builder_level = 1;
    if ((state.buildings.trap || 0) > 0 || (state.buildings.hut || 0) > 0) {
      state.unlocked.outside = true;
      state.builder_level = Math.max(state.builder_level, 4);
    }
    state.flags.wake_line = true;
    state.phase = derivePhase(state);
    if (state.phase === "forest" && state.location === "room") state.location = "outside";
    return state;
  }

  function parseBootQuery() {
    if (typeof location === "undefined" || !location.search) return {};
    try {
      var q = new URLSearchParams(location.search);
      return {
        fresh: q.get("fresh") === "1" || q.get("fresh") === "true",
        restore: q.get("restore") || "",
        importB64: q.get("import") || ""
      };
    } catch (e) {
      return {};
    }
  }

  function directorState(state) {
    return {
      fire: state.fire,
      temperature: state.temperature,
      builder_level: state.builder_level,
      npc_moods: deepClone(state.npc_moods),
      stores: deepClone(state.stores),
      buildings: deepClone(state.buildings),
      population: state.population,
      unlocked: deepClone(state.unlocked),
      phase: state.phase,
      location: state.location,
      flags: deepClone(state.flags),
      world: {
        on_expedition: state.world.on_expedition,
        x: state.world.x,
        y: state.world.y
      },
      game_time_sec: Math.round(state.game_time_sec * 10) / 10
    };
  }

  var TOOL_SCHEMA = [
    { name: "spawn_event", params: { event_id: "string", payload: "object?" } },
    { name: "give_item", params: { item: "string", amount: "number" } },
    { name: "change_npc_mood", params: { npc: "string", mood: "string" } },
    { name: "narrate", params: { text: "string", source: "string?" } },
    { name: "unlock_area", params: { area: "string" } },
    { name: "set_flag", params: { key: "string", value: "any" } }
  ];

  function validateCall(call, eventsCatalog) {
    if (!call || typeof call !== "object") return "call must be an object";
    if (TOOL_NAMES.indexOf(call.tool) < 0) return "unknown tool: " + call.tool;
    var a = call.args || {};
    switch (call.tool) {
      case "spawn_event":
        if (typeof a.event_id !== "string" || !a.event_id) return "event_id required";
        if (eventsCatalog && !eventsCatalog[a.event_id]) return "unknown event_id: " + a.event_id;
        break;
      case "give_item":
        if (ITEMS.indexOf(a.item) < 0) return "illegal item: " + a.item;
        if (typeof a.amount !== "number" || !isFinite(a.amount)) return "amount must be a number";
        break;
      case "change_npc_mood":
        if (NPCS.indexOf(a.npc) < 0) return "illegal npc";
        if (MOODS.indexOf(a.mood) < 0) return "illegal mood";
        break;
      case "narrate":
        if (typeof a.text !== "string" || !a.text) return "text required";
        break;
      case "unlock_area":
        if (AREAS.indexOf(a.area) < 0) return "illegal area";
        break;
      case "set_flag":
        if (typeof a.key !== "string" || !a.key) return "key required";
        break;
    }
    return null;
  }

  function pushNote(state, text, source) {
    if (!text) return;
    var line = /[。.!！?？]$/.test(text) ? text : text + "。";
    var top = state.notifications[0];
    if (top && top.text === line) {
      top.count = (top.count || 1) + 1;
      top.at = state.game_time_sec;
      if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.log) {
        ADRTelemetry.log("notification_dedup", { text: line, count: top.count });
      }
      return;
    }
    state.notifications.unshift({
      text: line,
      source: source || state.location,
      at: state.game_time_sec,
      count: 1
    });
    if (state.notifications.length > 30) state.notifications.length = 30;
  }

  function addItem(state, item, amount) {
    if (ITEMS.indexOf(item) < 0) return;
    if (item === "wood") state.wood_initialized = true;
    state.stores[item] = Math.max(0, (state.stores[item] || 0) + amount);
  }

  function visualSig(state) {
    var n0 = state.notifications[0];
    var ev = state.active_event;
    return [
      state.location, state.fire, state.temperature, state.builder_level,
      state.stores.wood, state.stores.fur, state.stores.meat, state.stores.compass,
      state.buildings.trap, state.buildings.cart, state.buildings.hut,
      state.population, state.unlocked.outside ? 1 : 0, state.unlocked.path ? 1 : 0,
      state.notifications.length, n0 ? n0.text : "", n0 ? (n0.count || 1) : "",
      ev ? ev.id : "", ev ? ev.scene : "",
      state.combat ? state.combat.hp : "",
      state.phase, state.slice_complete ? 1 : 0,
      state.goal ? state.goal.id : "", state.goal ? state.goal.text : "",
      state.world.on_expedition ? 1 : 0, state.world.x, state.world.y,
      state.world.hp, state.world.water,
      state.outfit.meat, state.outfit.cured_meat
    ].join("|");
  }

  function hutTitle(n) {
    if (n <= 0) return t("A Silent Forest");
    if (n === 1) return t("A Lonely Hut");
    if (n <= 4) return t("A Tiny Village");
    if (n <= 8) return t("A Modest Village");
    if (n <= 14) return t("A Large Village");
    return t("A Raucous Village");
  }

  function hasLateProgress(state) {
    return !!(state.buildings.lodge || state.buildings.tannery || state.buildings.smokehouse ||
      state.buildings.workshop || state.unlocked.ship || state.ending_reached ||
      (state.stores.leather || 0) > 0 || (state.stores.alien_alloy || 0) > 0);
  }

  function derivePhase(state) {
    if (state.flags && state.flags.prestige_done) return "prestige";
    if (state.ending_reached) return "ending";
    if (state.location === "space") return "space";
    if (state.location === "ship" || (state.unlocked.ship && state.location === "ship")) return "ship";
    if (state.location === "fabricator") return "fabricator";
    if (state.world.on_expedition) return "world";
    if (state.slice_complete && !hasLateProgress(state)) return "slice_complete";
    if (state.unlocked.path) return "path";
    if (state.buildings.hut > 0) return "village";
    if (state.unlocked.outside) return "forest";
    if (state.builder_level >= 1) return "stranger";
    if (state.fire > 0) return "room_fire";
    return "room_dark";
  }

  /* Persistent dark-room one-liner. First matching early gate wins.
   * Tone matches wake_line / RuleDirector: short, atmospheric Chinese. */
  function deriveGoal(state) {
    if (!state) return null;
    if (state.ending_reached) return { id: "prestige", text: "世界尽头。转生？", stage: "ending", action: "prestige" };
    if (state.world && state.world.on_expedition) return null;
    if (state.location === "space") return { id: "ascent", text: "穿过星尘", stage: "space", action: "space_steer" };
    if (state.unlocked && state.unlocked.ship && (state.ship.hull || 0) < 1) {
      return { id: "reinforce_hull", text: "用合金加固船身", stage: "ship", action: "reinforce_hull" };
    }
    if (state.unlocked && state.unlocked.ship && (state.ship.hull || 0) >= 1 && !state.ending_reached) {
      return { id: "liftoff", text: "升空", stage: "ship", action: "liftoff" };
    }
    var b = state.buildings || {};
    var st = state.stores || {};
    if (state.slice_complete && !b.lodge) {
      return { id: "build_lodge", text: "该建狩猎小屋了", stage: "village", action: "build", actionArgs: { kind: "lodge" } };
    }
    if (b.lodge && !b.tannery && (st.fur || 0) >= 25) {
      return { id: "build_tannery", text: "毛皮够了，建制革屋", stage: "village", action: "build", actionArgs: { kind: "tannery" } };
    }
    if (b.tannery && !b.smokehouse && (st.meat || 0) >= 25) {
      return { id: "build_smokehouse", text: "该建熏肉房了", stage: "village", action: "build", actionArgs: { kind: "smokehouse" } };
    }
    if (state.slice_complete) return null;
    var wood = (state.stores && state.stores.wood) || 0;
    var trap = (state.buildings && state.buildings.trap) || 0;
    var cart = (state.buildings && state.buildings.cart) || 0;
    var hut = (state.buildings && state.buildings.hut) || 0;
    var outside = !!(state.unlocked && state.unlocked.outside);
    var path = !!(state.unlocked && state.unlocked.path);
    var bl = state.builder_level;
    var loc = state.location;
    var seenForest = !!(state.flags && state.flags.goal_entered_forest);

    if (state.fire <= 0) {
      return { id: "light_fire", text: "火灭了，生火", stage: "room_dark", action: "light_fire" };
    }
    if (!outside && bl < 1) {
      return { id: "stoke_fire", text: "火还在，添柴", stage: "room_fire", action: "stoke_fire" };
    }
    if (!outside && bl >= 1) {
      return { id: "warm_stranger", text: "陌生人还在发抖，添柴", stage: "stranger", action: "stoke_fire" };
    }
    if (outside && !seenForest && loc !== "outside" && loc !== "path" && loc !== "world") {
      return { id: "go_forest", text: "去森林看看", stage: "forest", action: "travel", actionArgs: { area: "outside" } };
    }
    if (bl < 4) {
      return { id: "gather_wood", text: "林地上有枯枝，伐木", stage: "forest", action: "gather_wood" };
    }
    if (trap < 1) {
      if (wood >= 10) {
        return { id: "build_trap", text: "木头够了，做陷阱", stage: "forest", action: "build", actionArgs: { kind: "trap" } };
      }
      return { id: "gather_for_trap", text: "木头不够，去伐木", stage: "forest", action: "gather_wood" };
    }
    if (cart < 1) {
      if (wood >= 30) {
        return { id: "build_cart", text: "木头够了，造货车", stage: "forest", action: "build", actionArgs: { kind: "cart" } };
      }
      return { id: "gather_for_cart", text: "去伐木，造货车", stage: "forest", action: "gather_wood" };
    }
    if (hut < 1) {
      if (wood >= 100) {
        return { id: "build_hut", text: "木头够了，建小屋", stage: "forest", action: "build", actionArgs: { kind: "hut" } };
      }
      return { id: "gather_for_hut", text: "去伐木，建小屋", stage: "forest", action: "gather_wood" };
    }
    if (!path) {
      return { id: "check_traps", text: "去看看陷阱", stage: "village", action: "check_traps" };
    }
    return { id: "follow_compass", text: "罗盘指向东方", stage: "path", action: "embark" };
  }

  function goalMatchesAction(goal, action, args) {
    if (!goal || !goal.action || action !== goal.action) return false;
    var want = goal.actionArgs;
    if (!want) return true;
    args = args || {};
    var k;
    for (k in want) {
      if (Object.prototype.hasOwnProperty.call(want, k) && args[k] !== want[k]) return false;
    }
    return true;
  }

  function executeTool(state, call, ctx) {
    ctx = ctx || {};
    var events = ctx.events || {};
    var err = validateCall(call, events);
    if (err) return { ok: false, error: err };
    var a = call.args || {};
    switch (call.tool) {
      case "narrate":
        pushNote(state, a.text, a.source);
        break;
      case "give_item":
        addItem(state, a.item, a.amount);
        break;
      case "change_npc_mood":
        state.npc_moods[a.npc] = a.mood;
        break;
      case "unlock_area":
        state.unlocked[a.area] = true;
        if (a.area === "outside" && !state.wood_initialized) {
          addItem(state, "wood", 0);
        }
        break;
      case "set_flag":
        state.flags[a.key] = a.value;
        if (a.key === "builder_level" && typeof a.value === "number") {
          state.builder_level = a.value;
        }
        if (a.key === "visited_old_house" && a.value) {
          state.flags.visited_old_house = true;
        }
        break;
      case "spawn_event":
        if (state.active_event) return { ok: false, error: "event already open" };
        var spec = events[a.event_id];
        if (!spec) return { ok: false, error: "missing event" };
        state.active_event = {
          id: a.event_id,
          scene: "start",
          spec: spec,
          payload: a.payload || {}
        };
        if (spec.notification) pushNote(state, spec.notification, state.location);
        break;
    }
    return { ok: true };
  }

  function trapDrops(numTraps, bait) {
    var drops = {};
    var msgs = [];
    var extra = Math.min(bait, numTraps);
    var n = numTraps + extra;
    var table = [
      { name: "fur", roll: 0.5, msg: "毛皮碎屑" },
      { name: "meat", roll: 0.75, msg: "小片肉" },
      { name: "scales", roll: 0.85, msg: "古怪鳞片" },
      { name: "teeth", roll: 0.93, msg: "残缺牙齿" },
      { name: "cloth", roll: 0.995, msg: "破烂布料" },
      { name: "charm", roll: 1, msg: "做工粗糙的符咒" }
    ];
    for (var i = 0; i < n; i++) {
      var roll = Math.random();
      for (var j = 0; j < table.length; j++) {
        if (roll < table[j].roll) {
          drops[table[j].name] = (drops[table[j].name] || 0) + 1;
          if (msgs.indexOf(table[j].msg) < 0) msgs.push(table[j].msg);
          break;
        }
      }
    }
    return { drops: drops, msgs: msgs, baitUsed: extra };
  }

  function buildingCost(kind, count) {
    // @pacing kind=cost id=trap_base value=10 phase=forest
    // @pacing kind=cost id=trap_step value=10 phase=forest
    if (kind === "trap") return { wood: 10 + count * 10 };
    // @pacing kind=cost id=cart value=30 phase=forest
    if (kind === "cart") return { wood: 30 };
    // @pacing kind=cost id=hut_base value=100 phase=forest min=240s max=900s note=first hut vs gather+builder income
    // @pacing kind=cost id=hut_step value=50 phase=forest
    if (kind === "hut") return { wood: 100 + count * 50 };
    // @pacing kind=cost id=lodge value=200 phase=village
    if (kind === "lodge") return { wood: 200, fur: 10, meat: 5 };
    // @pacing kind=cost id=trading_post value=400 phase=village
    if (kind === "trading_post") return { wood: 400, fur: 100 };
    // @pacing kind=cost id=tannery value=500 phase=village
    if (kind === "tannery") return { wood: 500, fur: 50 };
    // @pacing kind=cost id=smokehouse value=600 phase=village
    if (kind === "smokehouse") return { wood: 600, meat: 50 };
    // @pacing kind=cost id=workshop value=800 phase=village
    if (kind === "workshop") return { wood: 800, leather: 100, scales: 10 };
    // @pacing kind=cost id=steelworks value=1500 phase=village
    if (kind === "steelworks") return { wood: 1500, iron: 100, coal: 100 };
    // @pacing kind=cost id=armoury value=3000 phase=village
    if (kind === "armoury") return { wood: 3000, steel: 100, sulphur: 50 };
    return null;
  }

  function jobUnlocked(state, job) {
    var spec = WORKER_JOBS[job];
    if (!spec) return false;
    if (spec.need && !(state.buildings[spec.need] > 0)) return false;
    if (spec.needFlag && !state.flags[spec.needFlag]) return false;
    return true;
  }

  function assignedWorkers(state) {
    var n = 0;
    Object.keys(state.workers).forEach(function (k) { n += state.workers[k] || 0; });
    return n;
  }

  function waterCapacity(state) {
    // original World.getMaxWater: tank +100, cask +50, recycler +20, waterskin +10, base 10
    if ((state.stores.water_tank || 0) > 0) return 10 + 100;
    if ((state.stores.cask || 0) > 0) return 10 + 50;
    if ((state.stores.fluid_recycler || 0) > 0) return 10 + 20;
    if ((state.stores.waterskin || 0) > 0) return 10 + 10;
    return 10;
  }

  function bagCapacity(state) {
    if ((state.stores.cargo_drone || 0) > 0) return 10 + 100;
    if ((state.stores.convoy || 0) > 0) return 10 + 60;
    if ((state.stores.wagon || 0) > 0) return 10 + 30;
    if ((state.stores.rucksack || 0) > 0) return 10 + 10;
    return 10;
  }

  function outfitWeight(outfit) {
    var w = 0;
    Object.keys(outfit || {}).forEach(function (k) { w += outfit[k] || 0; });
    return w;
  }

  function armourBonus(state) {
    if ((state.stores.kinetic_armour || 0) > 0 || (state.outfit.kinetic_armour || 0) > 0) return 15;
    if ((state.stores.s_armour || 0) > 0 || (state.outfit.s_armour || 0) > 0) return 10;
    if ((state.stores.i_armour || 0) > 0 || (state.outfit.i_armour || 0) > 0) return 6;
    if ((state.stores.l_armour || 0) > 0 || (state.outfit.l_armour || 0) > 0) return 3;
    return 0;
  }

  function bestWeapon(state, fromOutfit) {
    var bag = fromOutfit ? state.outfit : state.stores;
    var order = ["plasma_rifle", "grenade", "energy_blade", "laser_rifle", "bayonet", "steel_sword", "rifle", "iron_sword", "bone_spear"];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if ((bag[id] || 0) > 0 || (state.stores[id] || 0) > 0) {
        var w = WEAPONS[id];
        if (w.cost) {
          var okCost = Object.keys(w.cost).every(function (k) {
            return (state.outfit[k] || 0) > 0 || (state.stores[k] || 0) > 0;
          });
          if (!okCost) continue;
        }
        return { id: id, dmg: w.dmg, cost: w.cost || null };
      }
    }
    return { id: "fists", dmg: 1, cost: null };
  }

  function applyWorkerIncome(state, job, count, ticks) {
    var spec = WORKER_JOBS[job];
    if (!spec || count <= 0 || ticks <= 0) return;
    var stores = spec.stores;
    var keys = Object.keys(stores);
    var needNeg = keys.filter(function (k) { return stores[k] < 0; });
    for (var t = 0; t < ticks; t++) {
      var afford = needNeg.every(function (k) {
        return (state.stores[k] || 0) >= Math.abs(stores[k]) * count;
      });
      if (!afford) break;
      keys.forEach(function (k) {
        addItem(state, k, stores[k] * count);
      });
    }
  }

  function logMilestone(game, id, extra) {
    var s = game.state;
    if (s.flags["ms_" + id]) return;
    s.flags["ms_" + id] = true;
    game.analytics.log(s, "late_game_milestone", Object.assign({
      milestone: id,
      game_time_sec: Math.round(s.game_time_sec),
      phase: s.phase,
      location: s.location
    }, extra || {}));
  }

  function canAfford(state, cost) {
    for (var k in cost) {
      if ((state.stores[k] || 0) < cost[k]) return false;
    }
    return true;
  }

  function pay(state, cost) {
    for (var k in cost) addItem(state, k, -cost[k]);
  }

  function grant(state, reward) {
    if (!reward) return;
    for (var k in reward) addItem(state, k, reward[k]);
  }

  function nowMs() {
    return Date.now();
  }

  function cooldownLeft(state, id, timeScale) {
    var scale = timeScale > 0 ? timeScale : 1;
    var end = state.cooldown_ends_at && state.cooldown_ends_at[id];
    if (end) return Math.max(0, ((Number(end) - nowMs()) / 1000) * scale);
    return Math.max(0, Number(state.cooldowns && state.cooldowns[id]) || 0);
  }

  function cooldownReady(state, id) {
    var end = state.cooldown_ends_at && state.cooldown_ends_at[id];
    if (end) return Number(end) <= nowMs();
    return !state.cooldowns[id] || state.cooldowns[id] <= 0;
  }

  function setCooldown(state, id, sec, timeScale) {
    var scale = timeScale > 0 ? timeScale : 1;
    if (!state.cooldowns) state.cooldowns = {};
    if (!state.cooldown_ends_at) state.cooldown_ends_at = {};
    var wallSec = sec / scale;
    state.cooldown_ends_at[id] = nowMs() + wallSec * 1000;
    state.cooldowns[id] = sec;
  }

  function syncCooldowns(state, timeScale) {
    var scale = timeScale > 0 ? timeScale : 1;
    if (!state.cooldowns) state.cooldowns = {};
    if (!state.cooldown_ends_at) state.cooldown_ends_at = {};
    var ids = {};
    Object.keys(state.cooldowns).forEach(function (k) { ids[k] = true; });
    Object.keys(state.cooldown_ends_at).forEach(function (k) { ids[k] = true; });
    Object.keys(ids).forEach(function (id) {
      var left = cooldownLeft(state, id, scale);
      if (left <= 0) {
        delete state.cooldowns[id];
        delete state.cooldown_ends_at[id];
      } else {
        state.cooldowns[id] = left;
      }
    });
  }

  function adoptCooldowns(state, timeScale) {
    var scale = timeScale > 0 ? timeScale : 1;
    if (!state.cooldowns) state.cooldowns = {};
    if (!state.cooldown_ends_at) state.cooldown_ends_at = {};
    var now = nowMs();
    Object.keys(state.cooldowns).forEach(function (id) {
      if (state.cooldown_ends_at[id]) return;
      var left = Number(state.cooldowns[id]) || 0;
      if (left > 0) state.cooldown_ends_at[id] = now + (left / scale) * 1000;
    });
    syncCooldowns(state, scale);
  }

  function rescaleCooldownEnds(state, oldScale, newScale) {
    var from = oldScale > 0 ? oldScale : 1;
    var to = newScale > 0 ? newScale : 1;
    if (from === to) return;
    var now = nowMs();
    Object.keys(state.cooldown_ends_at || {}).forEach(function (id) {
      var leftGame = Math.max(0, ((Number(state.cooldown_ends_at[id]) - now) / 1000) * from);
      if (leftGame <= 0) {
        delete state.cooldown_ends_at[id];
        delete state.cooldowns[id];
        return;
      }
      state.cooldown_ends_at[id] = now + (leftGame / to) * 1000;
      state.cooldowns[id] = leftGame;
    });
  }

  function cooldownSnapshot(state, timeScale) {
    var remaining = {};
    var ends = {};
    ["stoke", "gather", "traps"].forEach(function (id) {
      remaining[id] = Math.round(cooldownLeft(state, id, timeScale) * 10) / 10;
      ends[id] = (state.cooldown_ends_at && state.cooldown_ends_at[id]) || 0;
    });
    return { remaining: remaining, ends_at: ends, wall_now: nowMs() };
  }

  function outsideTitle(state) {
    return hutTitle(state.buildings.hut);
  }

  function roomTitle(state) {
    return state.fire < 2 ? t("A Dark Room") : t("A Firelit Room");
  }

  function generateWorldSeed() {
    return 1;
  }

  function terrainAt(x, y, size) {
    var dx = x - Math.floor(size / 2);
    var dy = y - Math.floor(size / 2);
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1.2) return "village";
    if (d < 3) return "forest";
    if (d < 4.5) return "grass";
    return "dust";
  }

  function RuleDirector() {
    this.seen = {};
  }

  RuleDirector.prototype.think = function (state) {
    var calls = [];
    var f = state.flags;
    var once = function (key, list) {
      if (f[key] || this.seen[key]) return;
      this.seen[key] = true;
      calls.push({ tool: "set_flag", args: { key: key, value: true } });
      list.forEach(function (c) { calls.push(c); });
    }.bind(this);

    // @pacing kind=threshold id=light_spill_fire value=1 phase=room_fire note=fire must exceed this
    if (state.fire > 1 && state.builder_level < 0 && !f.builder_light_spilled) {
      once("builder_light_spilled", [
        { tool: "set_flag", args: { key: "builder_level", value: 0 } },
        { tool: "narrate", args: { text: t("the light from the fire spills from the windows, out into the dark"), source: "room" } },
        // @pacing kind=trigger id=builder_arrives value=30s phase=room_fire min=28s max=35s
        { tool: "set_flag", args: { key: "builder_arrives_at", value: state.game_time_sec + 30 } }
      ]);
    }

    if (state.builder_level === 0 && f.builder_arrives_at != null && state.game_time_sec >= f.builder_arrives_at && !f.stranger_arrived) {
      once("stranger_arrived", [
        { tool: "set_flag", args: { key: "builder_level", value: 1 } },
        { tool: "change_npc_mood", args: { npc: "builder", mood: "collapsed" } },
        { tool: "narrate", args: { text: t("a ragged stranger stumbles through the door and collapses in the corner"), source: "room" } },
        // @pacing kind=trigger id=need_wood value=15s phase=stranger min=14s max=20s
        { tool: "set_flag", args: { key: "need_wood_at", value: state.game_time_sec + 15 } }
      ]);
    }

    if (state.builder_level >= 1 && f.need_wood_at != null && state.game_time_sec >= f.need_wood_at && !f.outside_unlocked) {
      once("outside_unlocked", [
        { tool: "unlock_area", args: { area: "outside" } },
        // @pacing kind=income id=outside_starter_wood value=4 phase=forest
        { tool: "give_item", args: { item: "wood", amount: 4 } },
        { tool: "narrate", args: { text: t("the wind howls outside"), source: "room" } },
        { tool: "narrate", args: { text: t("the wood is running out"), source: "room" } },
        // @pacing kind=trigger id=builder_tick value=30s phase=stranger
        { tool: "set_flag", args: { key: "next_builder_tick", value: state.game_time_sec + 30 } }
      ]);
    }

    // @pacing kind=threshold id=builder_warm value=3 phase=stranger note=temperature needed for builder ticks
    if (state.builder_level >= 1 && state.builder_level < 3 && state.temperature >= 3) {
      var nxt = f.next_builder_tick;
      if (nxt != null && state.game_time_sec >= nxt && !f["builder_tick_" + (state.builder_level + 1)]) {
        var nextLv = state.builder_level + 1;
        var mood = nextLv === 2 ? "shivering" : "sleeping";
        var line = nextLv === 2
          ? t("the stranger shivers, and mumbles quietly. her words are unintelligible.")
          : t("the stranger in the corner stops shivering. her breathing calms.");
        once("builder_tick_" + nextLv, [
          { tool: "set_flag", args: { key: "builder_level", value: nextLv } },
          { tool: "change_npc_mood", args: { npc: "builder", mood: mood } },
          { tool: "narrate", args: { text: line, source: "room" } },
          // @pacing kind=trigger id=builder_tick value=30s phase=stranger
          { tool: "set_flag", args: { key: "next_builder_tick", value: state.game_time_sec + 30 } }
        ]);
      }
    }

    if (state.builder_level === 3 && state.location === "room" && !f.builder_helping) {
      once("builder_helping", [
        { tool: "set_flag", args: { key: "builder_level", value: 4 } },
        { tool: "change_npc_mood", args: { npc: "builder", mood: "helping" } },
        { tool: "narrate", args: { text: t("the stranger is standing by the fire. she says she can help. says she builds things."), source: "room" } }
      ]);
    }

    // @pacing kind=threshold id=craft_hint_trap value=5 phase=forest
    if (state.builder_level >= 4 && !f.craft_hint_trap && (state.stores.wood || 0) >= 5) {
      once("craft_hint_trap", [
        { tool: "narrate", args: { text: t("builder says she can make traps to catch any creatures might still be alive out there"), source: "room" } }
      ]);
    }

    // @pacing kind=threshold id=craft_hint_cart value=15 phase=forest
    if (state.builder_level >= 4 && !f.craft_hint_cart && (state.stores.wood || 0) >= 15) {
      once("craft_hint_cart", [
        { tool: "narrate", args: { text: t("builder says she can make a cart for carrying wood"), source: "room" } }
      ]);
    }

    // @pacing kind=threshold id=craft_hint_hut value=50 phase=forest
    if (state.builder_level >= 4 && !f.craft_hint_hut && (state.stores.wood || 0) >= 50) {
      once("craft_hint_hut", [
        { tool: "narrate", args: { text: t("builder says there are more wanderers. says they'll work, too."), source: "room" } }
      ]);
    }

    // @pacing kind=threshold id=compass_hut value=1 phase=village
    // @pacing kind=threshold id=compass_fur value=1 phase=village
    if (state.buildings.hut >= 1 && (state.stores.fur || 0) >= 1 && (state.stores.compass || 0) < 1 && !f.compass_offered) {
      once("compass_offered", [
        { tool: "spawn_event", args: { event_id: "builder_finds_compass" } }
      ]);
    }

    if ((state.stores.compass || 0) >= 1 && !state.unlocked.path) {
      once("path_unlocked", [
        { tool: "unlock_area", args: { area: "path" } },
        { tool: "unlock_area", args: { area: "world" } },
        { tool: "narrate", args: { text: t("the compass points east"), source: "path" } }
      ]);
    }

    if (!f.wake_line) {
      once("wake_line", [
        { tool: "narrate", args: { text: "醒来。头在痛。眼前模糊。去生火吧", source: "room" } }
      ]);
    }

    var evDue = f.next_world_event_at;
    if (evDue == null && state.unlocked.outside) {
      // @pacing kind=interval id=world_event_min value=180s phase=forest
      // @pacing kind=interval id=world_event_span value=180s phase=forest
      calls.push({ tool: "set_flag", args: { key: "next_world_event_at", value: state.game_time_sec + 180 + Math.random() * 180 } });
    } else if (evDue != null && state.game_time_sec >= evDue && !state.active_event && !state.world.on_expedition) {
      var pool = [];
      if (state.location === "room" && (state.stores.fur || 0) > 0) pool.push("nomad");
      if (state.location === "room" && state.wood_initialized) pool.push("noises_outside");
      if (state.location === "outside" && state.buildings.trap > 0) pool.push("ruined_trap");
      if (state.location === "outside" && state.population > 0) pool.push("beast_attack");
      if (pool.length) {
        var pick = pool[Math.floor(Math.random() * pool.length)];
        calls.push({ tool: "spawn_event", args: { event_id: pick } });
      }
      // @pacing kind=interval id=world_event_min value=180s phase=forest
      // @pacing kind=interval id=world_event_span value=180s phase=forest
      calls.push({ tool: "set_flag", args: { key: "next_world_event_at", value: state.game_time_sec + 180 + Math.random() * 180 } });
    }

    return calls;
  };

  function Analytics(opts) {
    this.opts = opts || {};
    this.buffer = [];
    this.sinks = [];
    this.lastProgress = { stores: 0, flags: 0, unlocks: 0, at: 0 };
    this.phaseEntered = 0;
    this.currentPhase = "room_dark";
    this.stuckFired = false;
    this.sessionStarted = {};
    this._recentSigs = [];
    // @pacing kind=interval id=stuck value=3min
    this.stuckMinutes = opts.stuck_minutes || 3;
    // @pacing kind=interval id=resource_snapshot value=15s
    this.snapshotEvery = opts.snapshot_interval_sec || 15;
    this.lastSnapshot = 0;
    this.lastStoreSig = "";
    this.lastChangeSnap = -10;
    this.recentActions = [];
    this.httpEndpoint = opts.analytics_endpoint || "";
    this.httpEnabled = !!opts.analytics_http_enabled;
    this.extraHeaders = opts.analytics_headers || {};
    this._lsKey = "adr.telemetry";
    this._loadLocal();
  }

  Analytics.prototype._loadLocal = function () {
    if (typeof localStorage === "undefined") return;
    try {
      var raw = localStorage.getItem(this._lsKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.buffer = parsed;
      }
    } catch (e) { /* ignore quota / private mode */ }
  };

  Analytics.prototype._persist = function () {
    if (typeof localStorage === "undefined") return;
    try {
      var keep = this.buffer.slice(-800);
      localStorage.setItem(this._lsKey, JSON.stringify(keep));
    } catch (e) { /* ignore */ }
  };

  function clientVersion() {
    try {
      var cfg = (typeof globalThis !== "undefined" && globalThis.ADR_TELEMETRY) || {};
      if (cfg && cfg.client_version) return String(cfg.client_version);
    } catch (e) { /* ignore */ }
    return "unknown";
  }

  function isAutomation() {
    try {
      if (typeof globalThis !== "undefined" && globalThis.ADR_AUTOMATION === true) return true;
      if (typeof navigator === "undefined") return true;
      if (navigator.webdriver) return true;
      return /Headless|PhantomJS|Playwright|Puppeteer|Lighthouse/i.test(navigator.userAgent || "");
    } catch (e) { return false; }
  }

  /* Re-anchor phase timing to the current state (after a save load, import or restart). */
  Analytics.prototype.syncPhase = function (state) {
    this.currentPhase = state.phase;
    this.phaseEntered = state.game_time_sec || 0;
    this.lastProgress = { stores: 0, flags: Object.keys(state.flags || {}).length, unlocks: 0, at: state.game_time_sec || 0 };
    this.stuckFired = false;
  };

  /* Player-driven progress resets the stuck timer; passive income (carts, builder) does not. */
  Analytics.prototype.noteProgress = function (state) {
    this.lastProgress.at = state.game_time_sec;
    this.stuckFired = false;
  };

  Analytics.prototype._isDuplicate = function (state, name, payload) {
    var sig;
    try { sig = state.session_id + "|" + name + "|" + Math.round(state.game_time_sec * 100) + "|" + JSON.stringify(payload || {}); } catch (e) { return false; }
    var now = Date.now();
    this._recentSigs = this._recentSigs.filter(function (r) { return now - r.at < 250; });
    for (var i = 0; i < this._recentSigs.length; i++) if (this._recentSigs[i].sig === sig) return true;
    this._recentSigs.push({ sig: sig, at: now });
    return false;
  };

  Analytics.prototype.log = function (state, name, payload) {
    payload = payload ? Object.assign({}, payload) : {};
    if (payload.is_automation == null) payload.is_automation = isAutomation();
    if (!payload.client_version) payload.client_version = clientVersion();
    if (name !== "director_think" && this._isDuplicate(state, name, payload)) return null;
    if (name === "session_start") {
      this.sessionStarted[state.session_id] = true;
    } else if (!this.sessionStarted[state.session_id] && name !== "session_end") {
      this.sessionStarted[state.session_id] = true;
      this.log(state, "session_start", { synthetic: true, reason: "missing_session_start", first_event: name });
    }
    if (name === "player_action") {
      this.recentActions.push({
        action: (payload || {}).action,
        args: (payload || {}).args || {},
        at: new Date().toISOString(),
        game_time_sec: Math.round(state.game_time_sec * 100) / 100,
        phase: state.phase
      });
      if (this.recentActions.length > 8) this.recentActions.shift();
      if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.noteLastAction) {
        ADRTelemetry.noteLastAction((payload || {}).action, (payload || {}).args);
      }
    }
    var level = arguments.length > 3 && arguments[3] ? arguments[3] : (name === "director_think" ? "debug" : "info");
    if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.log) {
      var evT = ADRTelemetry.log(name, payload || {}, level);
      this.buffer = ADRTelemetry.buffer || this.buffer;
      return evT;
    }
    if (level === "debug") {
      var debugOn = !!(this.opts && (this.opts.telemetry_debug === true || this.opts.telemetry_debug === 1 || this.opts.telemetry_debug === "1"));
      if (!debugOn) {
        if (typeof console !== "undefined" && console.debug) console.debug("[adr:debug]", name, payload || {});
        return null;
      }
    }
    var ev = {
      session_id: state.session_id,
      event_name: name,
      occurred_at: new Date().toISOString(),
      game_time_sec: Math.round(state.game_time_sec * 100) / 100,
      phase: state.phase,
      payload: payload || {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "node"
    };
    this.buffer.push(ev);
    this._persist();
    if (this.enqueueHttp) this.enqueueHttp(ev);
    else if (this.httpEnabled && this.httpEndpoint) this._post(ev);
    return ev;
  };

  Analytics.prototype.attachSupabase = function () {
    if (typeof ADRTelemetry !== "undefined") {
      if (ADRTelemetry.attachSink) ADRTelemetry.attachSink();
      var cfgT = (typeof globalThis !== "undefined" && globalThis.ADR_TELEMETRY) || {};
      this.httpEndpoint = cfgT.url || "";
      this.httpEnabled = !!cfgT.url;
      this.flushHttp = function () { ADRTelemetry.flush("manual"); };
      return;
    }
    var cfg = (typeof globalThis !== "undefined" && globalThis.ADR_TELEMETRY) || {};
    var sink = typeof globalThis !== "undefined" ? globalThis.ADRSupabaseSink : null;
    if (!cfg.url || !cfg.anonKey || !sink) return;
    var queue = [];
    function enqueue(ev) {
      queue.push(sink.rowFromEvent(ev));
      if (queue.length >= 15) flush();
    }
    function flush(reason) {
      if (!queue.length) return;
      var rows = queue.splice(0, 200);
      if (sink.postRows) {
        sink.postRows(cfg.url, cfg.anonKey, rows, { beacon: reason === "unload" });
        return;
      }
      fetch(cfg.url, {
        method: "POST",
        keepalive: true,
        headers: sink.headersFromAnonKey(cfg.anonKey),
        body: JSON.stringify(rows)
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
      }).catch(function () {
        for (var i = rows.length - 1; i >= 0; i--) queue.unshift(rows[i]);
      });
    }
    this.enqueueHttp = enqueue;
    this.flushHttp = flush;
    this.httpEndpoint = cfg.url;
    this.httpEnabled = true;
    // @pacing-ignore note=telemetry batch flush, not game pacing
    if (typeof setInterval === "function") setInterval(flush, 3000);
    if (typeof addEventListener === "function") {
      addEventListener("pagehide", function () { flush("unload"); });
      addEventListener("visibilitychange", function () {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") flush("hidden");
      });
    }
  };

  Analytics.prototype._post = function (ev) {
    if (typeof fetch !== "function") return;
    var headers = { "Content-Type": "application/json" };
    Object.keys(this.extraHeaders).forEach(function (k) {
      if (this.extraHeaders[k]) headers[k] = this.extraHeaders[k];
    }, this);
    fetch(this.httpEndpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(ev)
    }).catch(function () { /* playtest sink must not break the game */ });
  };

  Analytics.prototype.exportJson = function () {
    return JSON.stringify(this.buffer, null, 2);
  };

  Analytics.prototype.markProgress = function (state) {
    /* Story progress only: new flags, unlocks or buildings. Passive store income (carts,
     * builder, traps) used to count here, which kept the stuck timer from ever firing. */
    var built = 0;
    Object.keys(state.buildings || {}).forEach(function (k) { built += state.buildings[k] || 0; });
    var flags = Object.keys(state.flags).length;
    var unlocks = AREAS.filter(function (a) { return state.unlocked[a]; }).length;
    if (built > this.lastProgress.stores || flags > this.lastProgress.flags || unlocks > this.lastProgress.unlocks) {
      this.lastProgress = { stores: built, flags: flags, unlocks: unlocks, at: state.game_time_sec };
      this.stuckFired = false;
    }
  };

  Analytics.prototype.tickChecks = function (state) {
    if (state.phase !== this.currentPhase) {
      this.log(state, "phase_time", {
        phase: this.currentPhase,
        seconds: Math.round((state.game_time_sec - this.phaseEntered) * 10) / 10
      });
      this.currentPhase = state.phase;
      this.phaseEntered = state.game_time_sec;
    }
    this.markProgress(state);
    if (!this.stuckFired && state.game_time_sec - this.lastProgress.at >= this.stuckMinutes * 60) {
      this.stuckFired = true;
      this.log(state, "stuck", { phase: state.phase, idle_sec: Math.round(state.game_time_sec - this.lastProgress.at) });
    }
    var sig = [
      JSON.stringify(state.stores), JSON.stringify(state.buildings),
      state.fire, state.population, state.temperature
    ].join("|");
    if (sig !== this.lastStoreSig && state.game_time_sec - this.lastChangeSnap >= 2) {
      this.lastStoreSig = sig;
      this.lastChangeSnap = state.game_time_sec;
      this.lastSnapshot = state.game_time_sec;
      this.log(state, "resource_snapshot", {
        stores: deepClone(state.stores),
        buildings: deepClone(state.buildings),
        fire: state.fire,
        population: state.population,
        temperature: state.temperature,
        reason: "change"
      });
    } else if (state.game_time_sec - this.lastSnapshot >= this.snapshotEvery) {
      this.lastSnapshot = state.game_time_sec;
      this.lastStoreSig = sig;
      this.log(state, "resource_snapshot", {
        stores: deepClone(state.stores),
        buildings: deepClone(state.buildings),
        fire: state.fire,
        population: state.population,
        temperature: state.temperature,
        reason: "interval"
      });
    }
  };

  function Game(config, events) {
    this.config = config || {};
    this.events = events || {};
    // @pacing kind=interval id=time_scale value=1 phase=room_dark note=default 1x
    this.timeScale = this.config.time_scale || 1;
    this.directorName = this.config.director || "rule";
    this.rule = new RuleDirector();
    this.analytics = new Analytics(this.config);
    this.listeners = [];
    this._llmBusy = false;
    this._saveDirty = false;
    this._lastSaveAt = 0;
    this.state = createState();
    var boot = parseBootQuery();
    var restored = false;
    if (boot.fresh) {
      clearSave();
    } else if (boot.importB64) {
      restored = this.applyImportedSave(boot.importB64);
    } else if (boot.restore) {
      restored = this.restoreFromTelemetry(boot.restore);
    } else {
      restored = this.loadPersistedSave();
    }
    if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.bindGame) ADRTelemetry.bindGame(this);
    this.analytics.attachSupabase();
    this.analytics.syncPhase(this.state);
    this.analytics.log(this.state, "session_start", {
      director: this.directorName,
      restored: restored,
      save_key: SAVE_KEY
    });
    this.persistSave(!!boot.fresh || restored);
    this.directorTick();
    this.syncGoal("boot");
  }

  Game.prototype.syncGoal = function (reason, action, args) {
    var s = this.state;
    var prev = s.goal || (s.flags && s.flags.goal_id ? {
      id: s.flags.goal_id,
      text: s.flags.goal_text || "",
      stage: s.flags.goal_stage || "",
      action: s.flags.goal_action || "",
      actionArgs: s.flags.goal_action_args || null
    } : null);
    if (reason === "acted" && prev && goalMatchesAction(prev, action, args)) {
      var actedKey = "goal_acted_" + prev.id;
      if (!s.flags[actedKey]) {
        s.flags[actedKey] = true;
        this.analytics.log(s, "goal_prompt_acted", {
          goal_id: prev.id,
          text: prev.text,
          stage: prev.stage,
          action: action
        });
      }
    }
    if (action === "travel" && args && args.area === "outside") {
      s.flags.goal_entered_forest = true;
    }
    var next = deriveGoal(s);
    s.goal = next;
    var nextId = next ? next.id : "";
    var nextStage = next ? next.stage : "";
    var prevId = prev ? prev.id : "";
    var prevStage = prev ? prev.stage : "";
    if (nextId === prevId) return next;
    s.flags.goal_id = nextId;
    s.flags.goal_text = next ? next.text : "";
    s.flags.goal_stage = nextStage;
    s.flags.goal_action = next ? next.action : "";
    s.flags.goal_action_args = next && next.actionArgs ? next.actionArgs : {};
    if (next) {
      this.analytics.log(s, "goal_prompt_shown", {
        goal_id: next.id,
        text: next.text,
        stage: next.stage
      });
      if (nextStage && nextStage !== prevStage) {
        this.analytics.log(s, "stage_reached", {
          stage: nextStage,
          goal_id: next.id
        });
      }
    }
    return next;
  };

  Game.prototype.cooldownLeft = function (id) {
    return cooldownLeft(this.state, id, this.timeScale);
  };

  Game.prototype.syncCooldowns = function () {
    syncCooldowns(this.state, this.timeScale);
    return cooldownSnapshot(this.state, this.timeScale);
  };

  Game.prototype.logCooldownVisibility = function (visibility, extra) {
    extra = extra || {};
    var snap = cooldownSnapshot(this.state, this.timeScale);
    this.analytics.log(this.state, "cooldown_visibility", {
      visibility: visibility,
      remaining: snap.remaining,
      ends_at: snap.ends_at,
      wall_now: snap.wall_now,
      hidden_ms: extra.hidden_ms || 0,
      source: extra.source || "visibilitychange"
    });
    return snap;
  };

  Game.prototype.persistSave = function (force) {
    syncCooldowns(this.state, this.timeScale);
    var existing = force ? null : readSaveRaw({ silent: true });
    if (existing && existing.state) {
      var prev = existing.state;
      var blank = this.state.fire === 0 && this.state.game_time_sec < 0.5 && !(this.state.stores && this.state.stores.wood);
      var richer = (prev.fire || 0) > 0 || (prev.game_time_sec || 0) > 1 || (prev.stores && prev.stores.wood);
      if (blank && richer) return;
    }
    writeSave(this.state);
    this._saveDirty = false;
    this._lastSaveAt = Date.now();
  };

  Game.prototype.loadPersistedSave = function () {
    var doc = readSaveRaw();
    if (!doc) return false;
    this.state = hydrateState(doc.state);
    this.analytics.syncPhase(this.state);
    return true;
  };

  Game.prototype.applyImportedSave = function (b64) {
    var next = decodeImport(b64);
    if (!next) return false;
    this.state = next;
    this.analytics.syncPhase(this.state);
    return true;
  };

  Game.prototype.restoreFromTelemetry = function (sessionId) {
    var next = rebuildFromTelemetry(sessionId);
    if (!next) return false;
    this.state = next;
    this.analytics.syncPhase(this.state);
    return true;
  };

  Game.prototype.on = function (fn) {
    this.listeners.push(fn);
  };

  Game.prototype.emit = function () {
    var s = this.state;
    s.phase = derivePhase(s);
    this.listeners.forEach(function (fn) { fn(s); });
  };

  Game.prototype.applyCalls = function (calls, origin) {
    var self = this;
    if (!Array.isArray(calls) || !calls.length) return;
    calls.slice(0, 8).forEach(function (call) {
      var delay = typeof call.delay_sec === "number" ? call.delay_sec : 0;
      if (delay > 0) {
        self.state.scheduled.push({ at: self.state.game_time_sec + delay, call: call, origin: origin });
        return;
      }
      var result = executeTool(self.state, call, { events: self.events });
      self.analytics.log(self.state, "director_tool", {
        tool: call.tool,
        args: call.args || {},
        result: result.ok ? "ok" : "rejected",
        error: result.error || null,
        origin: origin
      });
      if (result.ok) {
        if (call.tool === "change_npc_mood") {
          self.analytics.log(self.state, "npc_interact", {
            npc: (call.args || {}).npc,
            mood: (call.args || {}).mood,
            origin: origin,
            moods: deepClone(self.state.npc_moods)
          });
        }
        if (call.tool === "narrate" || call.tool === "spawn_event") {
          self.analytics.log(self.state, "dialogue", {
            tool: call.tool,
            event_id: (call.args || {}).event_id || null,
            text: call.tool === "narrate" ? String((call.args || {}).text || "").slice(0, 160) : null,
            origin: origin
          });
        }
        if (call.tool === "unlock_area") {
          self.analytics.log(self.state, "unlock", {
            area: (call.args || {}).area,
            origin: origin,
            unlocked: deepClone(self.state.unlocked)
          });
        }
      }
    });
    this.emit();
  };

  Game.prototype.directorTick = function () {
    var self = this;
    if (this.directorName === "llm" && this.config.llm_endpoint) {
      if (this._llmBusy) return;
      this._llmBusy = true;
      var body = {
        session_id: this.state.session_id,
        game_time_sec: this.state.game_time_sec,
        state: directorState(this.state),
        tools: TOOL_SCHEMA,
        allowed_tools: TOOL_NAMES
      };
      this.analytics.log(this.state, "director_think", { director: "llm" }, "debug");
      var headers = { "Content-Type": "application/json" };
      if (this.config.llm_api_key) headers.Authorization = "Bearer " + this.config.llm_api_key;
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      // @pacing kind=interval id=llm_timeout value=8000ms
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
      fetch(this.config.llm_endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) { return r.json(); }).then(function (data) {
        self.applyCalls(data && data.calls, "llm");
      }).catch(function (err) {
        self.analytics.log(self.state, "director_error", { message: String(err && err.message || err) });
      }).then(function () {
        clearTimeout(timer);
        self._llmBusy = false;
      });
      return;
    }
    var calls = this.rule.think(this.state);
    this.analytics.log(this.state, "director_think", {
      director: "rule",
      call_count: calls ? calls.length : 0,
      tools: (calls || []).map(function (c) { return c && c.tool; })
    }, "debug");
    if (calls && calls.length) this.applyCalls(calls, "rule");
  };

  /* Every player action is reported: successes carry ok:true, failures ok:false + error
   * (cooldown, cost, locked, event_open, ...), which were previously invisible. */
  Game.prototype.act = function (action, args) {
    args = args || {};
    var res = this._act(action, args);
    if (res && res.ok === false) {
      this.analytics.log(this.state, "player_action", { action: action, args: args, ok: false, error: res.error || "unknown" });
    }
    return res;
  };

  Game.prototype._act = function (action, args) {
    args = args || {};
    var s = this.state;
    var note = null;
    if (s.active_event && action !== "event_choice" && action !== "combat" && action !== "export_telemetry" && action !== "set_director" && action !== "set_timescale" && action !== "travel") {
      return { ok: false, error: "event_open" };
    }
    switch (action) {
      case "light_fire":
      case "stoke_fire":
        if (!cooldownReady(s, "stoke")) return { ok: false, error: "cooldown" };
        if (s.fire <= 0) {
          // @pacing kind=cost id=light_fire_wood value=5 phase=room_dark
          if (s.wood_initialized && s.stores.wood < 5) {
            pushNote(s, t("not enough wood to get the fire going"), "room");
            note = "no_wood";
            break;
          }
          // @pacing kind=consume id=light_fire_wood value=5 phase=room_dark
          if (s.wood_initialized) addItem(s, "wood", -5);
          s.fire = 3;
        } else {
          if (s.wood_initialized && s.stores.wood <= 0) {
            pushNote(s, t("the wood has run out"), "room");
            note = "no_wood";
            break;
          }
          // @pacing kind=consume id=stoke_wood value=1 phase=room_fire
          if (s.wood_initialized) addItem(s, "wood", -1);
          s.fire = Math.min(4, s.fire + 1);
        }
        // @pacing kind=cooldown id=stoke value=10s phase=room_fire
        setCooldown(s, "stoke", 10, this.timeScale);
        this.analytics.log(s, "cooldown_set", {
          id: "stoke",
          duration_sec: 10,
          ends_at: s.cooldown_ends_at.stoke,
          time_scale: this.timeScale
        });
        // @pacing kind=interval id=fire_cool value=300s phase=room_fire
        s.flags.fire_cool_at = s.game_time_sec + 300;
        break;
      case "gather_wood":
        if (!s.unlocked.outside) return { ok: false, error: "locked" };
        if (!cooldownReady(s, "gather")) return { ok: false, error: "cooldown" };
        // @pacing kind=income id=gather_cart value=50 phase=forest note=per gather with cart
        // @pacing kind=income id=gather_wood value=10/60s phase=forest
        addItem(s, "wood", s.buildings.cart > 0 ? 50 : 10);
        // @pacing kind=cooldown id=gather value=60s phase=forest
        setCooldown(s, "gather", 60, this.timeScale);
        this.analytics.log(s, "cooldown_set", {
          id: "gather",
          duration_sec: 60,
          ends_at: s.cooldown_ends_at.gather,
          time_scale: this.timeScale
        });
        pushNote(s, t("dry brush and dead branches litter the forest floor"), "outside");
        break;
      case "check_traps":
        if (s.buildings.trap <= 0) return { ok: false, error: "no_traps" };
        if (!cooldownReady(s, "traps")) return { ok: false, error: "cooldown" };
        var tr = trapDrops(s.buildings.trap, s.stores.bait || 0);
        grant(s, tr.drops);
        if (tr.baitUsed) addItem(s, "bait", -tr.baitUsed);
        // @pacing kind=cooldown id=traps value=90s phase=forest
        setCooldown(s, "traps", 90, this.timeScale);
        this.analytics.log(s, "cooldown_set", {
          id: "traps",
          duration_sec: 90,
          ends_at: s.cooldown_ends_at.traps,
          time_scale: this.timeScale
        });
        if (tr.msgs.length) {
          var line = t("the traps contain ");
          tr.msgs.forEach(function (m, i) {
            if (i > 0 && i === tr.msgs.length - 1) line += t("and");
            else if (i > 0) line += "，";
            line += m;
          });
          pushNote(s, line, "outside");
        } else {
          pushNote(s, "陷阱是空的", "outside");
        }
        break;
      case "build":
        if (s.builder_level < 4) return { ok: false, error: "no_builder" };
        if (s.temperature <= 1) {
          pushNote(s, t("builder just shivers"), "room");
          return { ok: false, error: "too_cold" };
        }
        var kind = args.kind;
        if (CRAFTABLES[kind]) {
          var craft = CRAFTABLES[kind];
          if (s.buildings.workshop < 1 && kind !== "torch") return { ok: false, error: "no_workshop" };
          if (craft.max && (s.stores[kind] || 0) >= craft.max) return { ok: false, error: "max" };
          if (!canAfford(s, craft.cost)) return { ok: false, error: "cost" };
          pay(s, craft.cost);
          addItem(s, kind, craft.qty || 1);
          pushNote(s, t(craft.msg), "room");
          this.analytics.log(s, "build", { kind: kind, cost: craft.cost, have: s.stores[kind], type: "craft" });
          logMilestone(this, "craft_" + kind);
          break;
        }
        var max = BUILDING_MAX[kind] || 1;
        if (s.buildings[kind] == null) return { ok: false, error: "unknown_building" };
        if (s.buildings[kind] >= max) return { ok: false, error: "max" };
        var cost = buildingCost(kind, s.buildings[kind]);
        if (!cost || !canAfford(s, cost)) return { ok: false, error: "cost" };
        pay(s, cost);
        s.buildings[kind] += 1;
        if (BUILDING_MSG[kind]) pushNote(s, t(BUILDING_MSG[kind]), "room");
        if (kind === "hut") {
          // @pacing kind=interval id=pop_timer_min value=30s phase=village
          // @pacing kind=interval id=pop_timer_span value=150s phase=village
          if (s.pop_timer == null) s.pop_timer = s.game_time_sec + 30 + Math.random() * 150;
        }
        this.analytics.log(s, "build", {
          kind: kind,
          cost: cost,
          have: s.buildings[kind],
          buildings: deepClone(s.buildings),
          path: Object.keys(s.buildings).filter(function (k) { return s.buildings[k] > 0; })
        });
        logMilestone(this, "build_" + kind);
        break;
      case "travel":
        if (!s.unlocked[args.area] && args.area !== "room") return { ok: false, error: "locked" };
        if (s.world.on_expedition) return { ok: false, error: "away" };
        s.location = args.area;
        if (args.area === "outside") s.flags.goal_entered_forest = true;
        break;
      case "pack":
        var item = args.item;
        var n = args.amount | 0;
        if (ITEMS.indexOf(item) < 0) return { ok: false, error: "item" };
        if (n > 0) {
          var have = s.stores[item] || 0;
          var room = bagCapacity(s) - outfitWeight(s.outfit);
          var take = Math.min(n, have, Math.max(0, room));
          if (take <= 0) return { ok: false, error: "bag_full" };
          addItem(s, item, -take);
          s.outfit[item] = (s.outfit[item] || 0) + take;
        } else {
          var put = Math.min(-n, s.outfit[item] || 0);
          s.outfit[item] = (s.outfit[item] || 0) - put;
          addItem(s, item, put);
        }
        break;
      case "embark":
        if (!s.unlocked.path) return { ok: false, error: "locked" };
        if ((s.outfit.meat || 0) + (s.outfit.cured_meat || 0) <= 0) return { ok: false, error: "no_food" };
        s.world.on_expedition = true;
        s.world.size = WORLD_SIZE;
        s.world.x = WORLD_HOME.x;
        s.world.y = WORLD_HOME.y;
        s.world.max_water = waterCapacity(s);
        s.world.water = s.world.max_water;
        s.world.max_hp = 10 + armourBonus(s);
        s.world.hp = s.world.max_hp;
        s.world.food_moves = 0;
        s.location = "world";
        s.world.visited[WORLD_HOME.x + "," + WORLD_HOME.y] = true;
        if (!s.world.landmarks || !s.world.landmarks["33,28"]) {
          s.world.landmarks = Object.assign({}, DEFAULT_LANDMARKS, s.world.landmarks || {});
        }
        pushNote(s, t("A Barren World"), "world");
        logMilestone(this, "embark");
        break;
      case "world_move":
        if (!s.world.on_expedition) return { ok: false, error: "home" };
        var nx = s.world.x + (args.dx || 0);
        var ny = s.world.y + (args.dy || 0);
        if (nx < 0 || ny < 0 || nx >= s.world.size || ny >= s.world.size) return { ok: false, error: "edge" };
        s.world.x = nx;
        s.world.y = ny;
        s.world.visited[nx + "," + ny] = true;
        s.world.water -= 1;
        s.world.food_moves += 1;
        // @pacing kind=consume id=world_food_moves value=2 phase=world
        if (s.world.food_moves >= 2) {
          s.world.food_moves = 0;
          if ((s.outfit.cured_meat || 0) > 0) s.outfit.cured_meat -= 1;
          else if ((s.outfit.meat || 0) > 0) s.outfit.meat -= 1;
          else {
            pushNote(s, t("the meat has run out"), "world");
            pushNote(s, t("starvation sets in"), "world");
            s.world.hp -= 2;
          }
        }
        if (s.world.water <= 0) {
          pushNote(s, t("there is no more water"), "world");
          pushNote(s, t("the thirst becomes unbearable"), "world");
          s.world.hp -= 2;
        }
        if (nx === WORLD_HOME.x && ny === WORLD_HOME.y) {
          this._goHome(true);
          break;
        }
        var d = Math.abs(nx - WORLD_HOME.x) + Math.abs(ny - WORLD_HOME.y);
        if (d >= 4 && !s.world.seen_danger) {
          s.world.seen_danger = true;
          pushNote(s, t("dangerous to be this far from the village without proper protection"), "world");
        }
        var lm = s.world.landmarks[nx + "," + ny];
        if (lm && !s.active_event) {
          executeTool(s, { tool: "spawn_event", args: { event_id: lm } }, { events: this.events });
          var evLm = this.events[lm];
          if (evLm && evLm.combat) {
            s.combat = { hp: evLm.combat.hp, dmg: evLm.combat.dmg, name: evLm.combat.name, reward: evLm.combat.reward };
          }
        } else if (d > 0 && Math.random() < 0.18 && !s.active_event) {
          executeTool(s, { tool: "spawn_event", args: { event_id: "snarling_beast" }, delay_sec: 0 }, { events: this.events });
          var ev = this.events.snarling_beast;
          if (ev && ev.combat) {
            s.combat = { hp: ev.combat.hp, dmg: ev.combat.dmg, name: ev.combat.name, reward: ev.combat.reward };
          }
        }
        if (s.world.hp <= 0) {
          this.analytics.log(s, "death", { where: "world" });
          pushNote(s, t("the world fades"), "world");
          this._goHome(false);
        }
        break;
      case "assign_worker": {
        var job = args.job;
        var delta = args.delta | 0;
        if (!WORKER_JOBS[job] || job === "gatherer") return { ok: false, error: "job" };
        if (delta > 0 && !jobUnlocked(s, job)) return { ok: false, error: "locked_job" };
        if (delta > 0) {
          var idle = s.workers.gatherer || 0;
          if (idle < delta) return { ok: false, error: "no_idle" };
          s.workers.gatherer = idle - delta;
          s.workers[job] = (s.workers[job] || 0) + delta;
        } else {
          var haveJob = s.workers[job] || 0;
          if (haveJob + delta < 0) return { ok: false, error: "none" };
          s.workers[job] = haveJob + delta;
          s.workers.gatherer = (s.workers.gatherer || 0) - delta;
        }
        break;
      }
      case "buy": {
        if (s.buildings.trading_post < 1) return { ok: false, error: "no_trading_post" };
        var good = args.item;
        var buyTable = {
          scales: { fur: 150 }, teeth: { fur: 300 }, iron: { fur: 150, scales: 50 },
          coal: { fur: 200, teeth: 50 }, steel: { fur: 300, scales: 50, teeth: 50 },
          medicine: { scales: 50, teeth: 30 }, bullets: { scales: 10 },
          energy_cell: { scales: 10, teeth: 10 }
        };
        var buyCost = buyTable[good];
        if (!buyCost || !canAfford(s, buyCost)) return { ok: false, error: "cost" };
        pay(s, buyCost);
        addItem(s, good, 1);
        break;
      }
      case "reinforce_hull":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        if ((s.stores.alien_alloy || 0) < 1) {
          pushNote(s, t("not enough alien alloy"), "ship");
          return { ok: false, error: "cost" };
        }
        addItem(s, "alien_alloy", -1);
        s.ship.hull += 1;
        logMilestone(this, "reinforce_hull", { hull: s.ship.hull });
        break;
      case "upgrade_engine":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        if ((s.stores.alien_alloy || 0) < 1) return { ok: false, error: "cost" };
        addItem(s, "alien_alloy", -1);
        s.ship.thrusters += 1;
        break;
      case "liftoff":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        if ((s.ship.hull || 0) < 1) return { ok: false, error: "no_hull" };
        if (!cooldownReady(s, "liftoff")) return { ok: false, error: "cooldown" };
        setCooldown(s, "liftoff", 120, this.timeScale);
        s.unlocked.space = true;
        s.location = "space";
        s.space = { altitude: 0, x: 0, hull: s.ship.hull, max_hull: s.ship.hull, done: false };
        pushNote(s, "船体震颤，尘土世界被抛在后面。", "space");
        logMilestone(this, "liftoff", { hull: s.ship.hull, thrusters: s.ship.thrusters });
        break;
      case "space_steer": {
        if (s.location !== "space" || s.space.done) return { ok: false, error: "not_space" };
        var dx = args.dx || 0;
        s.space.x = Math.max(-2, Math.min(2, s.space.x + dx));
        var speed = 3 + (s.ship.thrusters || 1);
        s.space.altitude += speed;
        var rockX = ((Math.floor(s.space.altitude / speed) * 7 + 3) % 5) - 2;
        if (rockX === s.space.x) {
          s.space.hull -= 1;
          pushNote(s, "陨石擦过船体。", "space");
        }
        if (s.space.hull <= 0) {
          pushNote(s, t("the world fades"), "space");
          this.analytics.log(s, "death", { where: "space" });
          s.location = "ship";
          s.space.done = true;
          return { ok: true, error: "crashed" };
        }
        if (s.space.altitude >= 60) {
          s.space.done = true;
          s.ending_reached = true;
          pushNote(s, "星空吞没了最后一点尘埃。你到了。", "space");
          this.analytics.log(s, "ending_reached", { game_time_sec: s.game_time_sec, hull: s.space.hull });
          logMilestone(this, "ending");
        }
        break;
      }
      case "fabricate": {
        if (!s.unlocked.fabricator) return { ok: false, error: "locked" };
        var fid = args.kind;
        var fspec = FABRICATOR_CRAFTS[fid];
        if (!fspec) return { ok: false, error: "unknown" };
        if (fspec.needFlag && !s.flags[fspec.needFlag]) return { ok: false, error: "no_blueprint" };
        if (fspec.max && (s.stores[fid] || 0) >= fspec.max) return { ok: false, error: "max" };
        if (!canAfford(s, fspec.cost)) return { ok: false, error: "cost" };
        pay(s, fspec.cost);
        addItem(s, fid, fspec.qty || 1);
        pushNote(s, t(fspec.msg), "fabricator");
        logMilestone(this, "fabricate_" + fid);
        break;
      }
      case "prestige": {
        if (!s.ending_reached) return { ok: false, error: "no_ending" };
        var kept = {};
        ITEMS.forEach(function (k) {
          var n = s.stores[k] || 0;
          kept[k] = Math.floor(n / 8);
        });
        var runs = (s.prestige && s.prestige.runs) || 0;
        this.analytics.log(s, "prestige_start", { game_time_sec: s.game_time_sec, runs: runs + 1, kept: kept });
        logMilestone(this, "prestige");
        var oldA2 = this.analytics;
        oldA2.log(s, "session_end", { reason: "prestige" });
        clearSave();
        if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.rotateSession) ADRTelemetry.rotateSession();
        this.state = createState();
        this.rule = new RuleDirector();
        Object.keys(kept).forEach(function (k) {
          if (kept[k] > 0) this.state.stores[k] = kept[k];
        }, this);
        if ((this.state.stores.wood || 0) > 0) this.state.wood_initialized = true;
        this.state.prestige = { stores: kept, score: Math.round(s.game_time_sec), runs: runs + 1 };
        this.state.flags.prestige_done = true;
        if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.bindGame) ADRTelemetry.bindGame(this);
        this.analytics.syncPhase(this.state);
        this.analytics.log(this.state, "session_start", { director: this.directorName, prestige: true, run: runs + 1 });
        this.persistSave();
        break;
      }
      case "event_choice":
        this.analytics.log(s, "dialogue_choice", {
          event_id: s.active_event ? s.active_event.id : null,
          scene: s.active_event ? s.active_event.scene : null,
          button: args.button
        });
        this._resolveEvent(args.button);
        break;
      case "combat":
        this._combat(args.move);
        break;
      case "set_director":
        this.directorName = args.name === "llm" ? "llm" : "rule";
        this.config.director = this.directorName;
        if (args.endpoint) this.config.llm_endpoint = args.endpoint;
        if (args.api_key != null) this.config.llm_api_key = args.api_key;
        break;
      case "set_timescale":
        var cap = this.config.max_time_scale || 100;
        var nextScale = Math.max(0.25, Math.min(cap, args.scale || 1));
        rescaleCooldownEnds(s, this.timeScale, nextScale);
        this.timeScale = nextScale;
        break;
      case "set_analytics":
        this.analytics.httpEndpoint = args.endpoint || "";
        this.analytics.httpEnabled = !!args.enabled;
        this.analytics.extraHeaders = args.headers || {};
        this.config.analytics_endpoint = this.analytics.httpEndpoint;
        break;
      case "restart":
        var oldA = this.analytics;
        var prevCtx = (typeof ADRSaveTelemetry !== "undefined" && ADRSaveTelemetry.previousSaveContext)
          ? ADRSaveTelemetry.previousSaveContext()
          : null;
        oldA.log(s, "session_end", { reason: "restart" });
        if (typeof ADRSaveTelemetry !== "undefined" && ADRSaveTelemetry.onNewGame) {
          ADRSaveTelemetry.onNewGame({ overwritten: true });
        }
        clearSave();
        if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.rotateSession) ADRTelemetry.rotateSession();
        this.state = createState();
        this.rule = new RuleDirector();
        if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.bindGame) ADRTelemetry.bindGame(this);
        this.analytics.syncPhase(this.state);
        this.analytics.log(this.state, "session_start", { director: this.directorName, restart: true });
        this.analytics.log(this.state, "new_game_start", {
          overwritten: !!(prevCtx && prevCtx.save_id),
          previous_save_id: prevCtx && prevCtx.save_id || null,
          previous_phase: prevCtx && prevCtx.phase || s.phase,
          previous_play_time_sec: prevCtx && prevCtx.play_time_sec != null ? prevCtx.play_time_sec : s.game_time_sec,
          previous_last_action: (prevCtx && prevCtx.last_action) || oldA.recentActions[oldA.recentActions.length - 1] || null,
          previous_last_save_at: prevCtx && prevCtx.saved_at || null,
          recent_actions: oldA.recentActions.slice(),
          last_phase: s.phase
        });
        oldA.recentActions = [];
        this.persistSave();
        break;
      case "quit":
        this.analytics.log(s, "quit", {});
        this.analytics.log(s, "session_end", { reason: "quit" });
        break;
      default:
        return { ok: false, error: "unknown_action" };
    }
    if (action !== "travel") this.analytics.noteProgress(s);
    this.analytics.log(s, "player_action", { action: action, args: args, note: note, ok: true });
    if (typeof ADRTelemetry !== "undefined" && ADRTelemetry.playTone) {
      var tones = { light_fire: 196, stoke_fire: 220, gather_wood: 165, build: 262, travel: 147, embark: 311 };
      if (tones[action]) ADRTelemetry.playTone(action, { freq: tones[action], sec: 0.06 });
    }
    s.phase = derivePhase(s);
    this.directorTick();
    this.syncGoal("acted", action, args);
    this.emit();
    if (action !== "quit") this.persistSave();
    return { ok: true };
  };

  Game.prototype._goHome = function (success) {
    var s = this.state;
    for (var k in s.outfit) {
      if (s.outfit[k] > 0) addItem(s, k, s.outfit[k]);
      s.outfit[k] = 0;
    }
    if (s.flags.visited_old_house && success && !s.slice_complete) {
      s.slice_complete = true;
      pushNote(s, "你带回了旧房子里的见闻。尘途的第一段走完了。", "path");
      this.analytics.log(s, "slice_complete", { game_time_sec: s.game_time_sec });
      logMilestone(this, "slice_complete");
    }
    if (success) pushNote(s, t("water replenished"), "path");
    s.world.on_expedition = false;
    s.location = "path";
    s.active_event = null;
    s.combat = null;
  };

  Game.prototype._resolveEvent = function (buttonId) {
    var s = this.state;
    if (!s.active_event) return;
    var spec = s.active_event.spec;
    var scene = s.active_event.scene === "start" ? spec : (spec.scenes && spec.scenes[s.active_event.scene]) || spec;
    var btn = (scene.buttons || spec.buttons || []).filter(function (b) { return b.id === buttonId; })[0];
    if (!btn) return;
    if (btn.cost && !canAfford(s, btn.cost)) return;
    if (btn.cost) pay(s, btn.cost);
    if (btn.reward) grant(s, btn.reward);
    if (btn.note) pushNote(s, btn.note, s.location);
    if (btn.lose_pop) s.population = Math.max(0, s.population - btn.lose_pop);
    if (btn.set_flag) s.flags[btn.set_flag] = true;
    if (btn.unlock_area) {
      s.unlocked[btn.unlock_area] = true;
      this.analytics.log(s, "unlock", { area: btn.unlock_area, origin: "event" });
    }
    if (btn.require_no && (s.stores[btn.require_no] || 0) > 0) {
      /* still allow close */
    }
    if (btn.random_next) {
      var r = Math.random();
      var acc = 0;
      var pick = null;
      Object.keys(btn.random_next).forEach(function (k) {
        acc += btn.random_next[k];
        if (pick == null && r <= acc) pick = k;
      });
      if (pick && spec.scenes && spec.scenes[pick]) {
        s.active_event.scene = pick;
        var sc = spec.scenes[pick];
        if (sc.reward) grant(s, sc.reward);
        if (sc.set_flag) s.flags[sc.set_flag] = true;
        if (sc.unlock_area) {
          s.unlocked[sc.unlock_area] = true;
          this.analytics.log(s, "unlock", { area: sc.unlock_area, origin: "event" });
        }
        if (sc.water && s.world.on_expedition) s.world.water = Math.min(s.world.max_water || 10, s.world.water + sc.water);
        return;
      }
    }
    if (btn.next && btn.next !== "end" && spec.scenes && spec.scenes[btn.next]) {
      s.active_event.scene = btn.next;
      var sc2 = spec.scenes[btn.next];
      if (sc2.reward) grant(s, sc2.reward);
      if (sc2.set_flag) s.flags[sc2.set_flag] = true;
      if (sc2.unlock_area) {
        s.unlocked[sc2.unlock_area] = true;
        this.analytics.log(s, "unlock", { area: sc2.unlock_area, origin: "event" });
      }
      if (sc2.water && s.world.on_expedition) s.world.water = Math.min(s.world.max_water || 10, s.world.water + sc2.water);
      return;
    }
    if (spec.scenes && scene !== spec && scene.set_flag) s.flags[scene.set_flag] = true;
    if (spec.scenes && scene !== spec && scene.unlock_area) {
      s.unlocked[scene.unlock_area] = true;
      this.analytics.log(s, "unlock", { area: scene.unlock_area, origin: "event" });
    }
    s.active_event = null;
    if (s.combat) s.combat = null;
  };

  Game.prototype._combat = function (move) {
    var s = this.state;
    if (!s.combat) return;
    if (move === "punch" || move === "attack") {
      var wpn = bestWeapon(s, true);
      if (wpn.cost) {
        var paid = false;
        Object.keys(wpn.cost).forEach(function (k) {
          if ((s.outfit[k] || 0) > 0) { s.outfit[k] -= wpn.cost[k]; paid = true; }
          else if ((s.stores[k] || 0) > 0) { addItem(s, k, -wpn.cost[k]); paid = true; }
        });
        if (!paid) wpn = { id: "fists", dmg: 1, cost: null };
      }
      s.combat.hp -= wpn.dmg + (Math.random() < 0.3 ? 1 : 0);
      var hitChance = 0.55 - armourBonus(s) * 0.02;
      if (Math.random() < Math.max(0.15, hitChance)) s.world.hp -= s.combat.dmg;
      if (s.combat.hp <= 0) {
        grant(s, s.combat.reward);
        pushNote(s, (s.combat.name || "野兽") + "倒下了。", "world");
        if (s.active_event && s.active_event.spec && s.active_event.spec.on_win_flag) {
          s.flags[s.active_event.spec.on_win_flag] = true;
        }
        s.combat = null;
        s.active_event = null;
      }
    } else if (move === "eat") {
      if ((s.outfit.cured_meat || 0) > 0) {
        s.outfit.cured_meat -= 1;
        s.world.hp = Math.min(s.world.max_hp || 10, s.world.hp + 8);
      } else if ((s.outfit.meat || 0) > 0) {
        s.outfit.meat -= 1;
        s.world.hp = Math.min(s.world.max_hp || 10, s.world.hp + 8);
      } else {
        return { ok: false, error: "no_food" };
      }
    } else if (move === "flee") {
      if (Math.random() < 0.5) {
        s.world.hp -= 1;
        pushNote(s, "逃脱时挨了一下。", "world");
      }
      s.combat = null;
      s.active_event = null;
    }
    if (s.world.hp <= 0) {
      this.analytics.log(s, "death", { where: "combat" });
      pushNote(s, t("the world fades"), "world");
      this._goHome(false);
    }
  };

  Game.prototype.tick = function (dtReal) {
    var s = this.state;
    var beforeSig = visualSig(s);
    var dt = dtReal * this.timeScale;
    s.game_time_sec += dt;
    syncCooldowns(s, this.timeScale);

    if (s.flags.fire_cool_at != null && s.game_time_sec >= s.flags.fire_cool_at && s.fire > 0) {
      if (s.builder_level > 3 && s.fire <= 2 && (s.stores.wood || 0) > 0) {
        // @pacing kind=consume id=builder_stoke_wood value=1 phase=forest
        addItem(s, "wood", -1);
        s.fire = Math.min(4, s.fire + 1);
        pushNote(s, t("builder stokes the fire"), "room");
      } else {
        s.fire = Math.max(0, s.fire - 1);
      }
      // @pacing kind=interval id=fire_cool value=300s phase=room_fire
      s.flags.fire_cool_at = s.fire > 0 ? s.game_time_sec + 300 : null;
    }

    // @pacing kind=interval id=temp_tick value=30s phase=room_fire
    if (!s.flags.next_temp_at) s.flags.next_temp_at = s.game_time_sec + 30;
    if (s.game_time_sec >= s.flags.next_temp_at) {
      if (s.temperature > s.fire) s.temperature -= 1;
      else if (s.temperature < s.fire) s.temperature += 1;
      // @pacing kind=interval id=temp_tick value=30s phase=room_fire
      s.flags.next_temp_at = s.game_time_sec + 30;
    }

    if (s.builder_level >= 4) {
      s.income_acc.builder += dt;
      // @pacing kind=income id=builder_wood value=2/10s phase=forest
      if (s.income_acc.builder >= 10) {
        var n = Math.floor(s.income_acc.builder / 10);
        s.income_acc.builder -= n * 10;
        addItem(s, "wood", 2 * n);
      }
    }
    if (!s.income_acc) s.income_acc = emptyIncomeAcc();
    Object.keys(WORKER_JOBS).forEach(function (job) {
      var count = s.workers[job] || 0;
      if (job === "gatherer" && count <= 0 && s.population > 0 && assignedWorkers(s) === 0) {
        count = s.population;
      }
      if (count <= 0 || !jobUnlocked(s, job)) return;
      s.income_acc[job] = (s.income_acc[job] || 0) + dt;
      var delay = WORKER_JOBS[job].delay;
      if (s.income_acc[job] >= delay) {
        var ticks = Math.floor(s.income_acc[job] / delay);
        s.income_acc[job] -= ticks * delay;
        applyWorkerIncome(s, job, count, ticks);
      }
    });

    if (s.pop_timer != null && s.game_time_sec >= s.pop_timer) {
      var cap = s.buildings.hut * 4;
      var space = cap - s.population;
      if (space > 0) {
        var add = Math.max(1, Math.floor(space / 2) + Math.floor(Math.random() * Math.max(1, space - Math.floor(space / 2))));
        add = Math.min(add, space);
        s.population += add;
        s.workers.gatherer = (s.workers.gatherer || 0) + add;
        if (add === 1) pushNote(s, t("a stranger arrives in the night"), "outside");
        else if (add <= 3) pushNote(s, "一户饱经风雨的人家住进一栋小屋。", "outside");
        else pushNote(s, "一群瘦骨嶙峋，风尘仆仆的人抵达了。", "outside");
      }
      // @pacing kind=interval id=pop_timer_min value=30s phase=village
      // @pacing kind=interval id=pop_timer_span value=150s phase=village
      s.pop_timer = cap > s.population ? s.game_time_sec + 30 + Math.random() * 150 : null;
    }

    var still = [];
    var due = [];
    s.scheduled.forEach(function (job) {
      if (s.game_time_sec >= job.at) due.push(job);
      else still.push(job);
    });
    s.scheduled = still;
    var self = this;
    due.forEach(function (job) {
      var result = executeTool(s, job.call, { events: self.events });
      self.analytics.log(s, "director_tool", {
        tool: job.call.tool,
        args: job.call.args || {},
        result: result.ok ? "ok" : "rejected",
        error: result.error || null,
        origin: job.origin || "scheduled"
      });
    });

    if (!s.flags._dir_acc) s.flags._dir_acc = 0;
    s.flags._dir_acc += dt;
    // @pacing kind=interval id=director_think value=1s
    if (s.flags._dir_acc >= 1) {
      s.flags._dir_acc = 0;
      this.directorTick();
    }

    s.phase = derivePhase(s);
    this.syncGoal("tick");
    this.analytics.tickChecks(s);
    if (visualSig(s) !== beforeSig) this.emit();
    this._saveDirty = true;
    // @pacing-ignore note=autosave wall-clock, not game pacing
    if (Date.now() - this._lastSaveAt >= 3000) this.persistSave();
    if (this.hud) this.hud();
  };

  Game.prototype.visibleCrafts = function () {
    var s = this.state;
    if (s.builder_level < 4) return [];
    var out = [];
    var kinds = ["trap", "cart", "hut", "lodge", "trading_post", "tannery", "smokehouse", "workshop", "steelworks", "armoury"];
    kinds.forEach(function (kind) {
      var n = s.buildings[kind] || 0;
      var max = BUILDING_MAX[kind] || 1;
      var cost = buildingCost(kind, n);
      if (!cost) return;
      var need = cost.wood || cost.fur || cost.leather || cost.iron || 0;
      var haveMain = cost.wood != null ? (s.stores.wood || 0) : (s.stores[Object.keys(cost)[0]] || 0);
      // @pacing kind=threshold id=craft_visible_ratio value=0.5 phase=forest
      var show = haveMain >= need * 0.5;
      if (kind === "workshop" && (s.stores.leather || 0) < 50) show = false;
      if (kind === "steelworks" && !s.flags.cleared_iron_mine) show = false;
      if (kind === "armoury" && (s.buildings.steelworks || 0) < 1) show = false;
      if (show) out.push({ kind: kind, cost: cost, have: n, max: max, can: canAfford(s, cost) && n < max && s.temperature > 1, type: "building" });
    });
    if (s.buildings.workshop > 0) {
      Object.keys(CRAFTABLES).forEach(function (kind) {
        var spec = CRAFTABLES[kind];
        var have = s.stores[kind] || 0;
        if (spec.max && have >= spec.max) return;
        var c0 = spec.cost[Object.keys(spec.cost)[0]] || 0;
        var h0 = s.stores[Object.keys(spec.cost)[0]] || 0;
        if (h0 < c0 * 0.5 && kind !== "torch") return;
        out.push({ kind: kind, cost: spec.cost, have: have, max: spec.max || 99, can: canAfford(s, spec.cost) && s.temperature > 1, type: "craft" });
      });
    }
    return out;
  };

  Game.prototype.visibleWorkers = function () {
    var s = this.state;
    return Object.keys(WORKER_JOBS).filter(function (job) {
      return job === "gatherer" || jobUnlocked(s, job);
    }).map(function (job) {
      return { job: job, name: WORKER_CN[job] || job, count: s.workers[job] || 0 };
    });
  };

  Game.prototype.visibleFabricator = function () {
    var s = this.state;
    if (!s.unlocked.fabricator) return [];
    return Object.keys(FABRICATOR_CRAFTS).filter(function (k) {
      var spec = FABRICATOR_CRAFTS[k];
      return !spec.needFlag || s.flags[spec.needFlag];
    }).map(function (k) {
      var spec = FABRICATOR_CRAFTS[k];
      return { kind: k, cost: spec.cost, can: canAfford(s, spec.cost), have: s.stores[k] || 0 };
    });
  };

  return {
    ITEMS: ITEMS,
    ITEM_CN: ITEM_CN,
    BUILDING_CN: BUILDING_CN,
    WORKER_CN: WORKER_CN,
    BUILDING_MAX: BUILDING_MAX,
    CRAFTABLES: CRAFTABLES,
    FABRICATOR_CRAFTS: FABRICATOR_CRAFTS,
    WORKER_JOBS: WORKER_JOBS,
    WEAPONS: WEAPONS,
    WORLD_SIZE: WORLD_SIZE,
    WORLD_HOME: WORLD_HOME,
    DEFAULT_LANDMARKS: DEFAULT_LANDMARKS,
    FIRE: FIRE,
    TEMP: TEMP,
    TOOL_SCHEMA: TOOL_SCHEMA,
    STRINGS: STRINGS,
    deriveGoal: deriveGoal,
    t: t,
    createState: createState,
    directorState: directorState,
    validateCall: validateCall,
    executeTool: executeTool,
    RuleDirector: RuleDirector,
    Analytics: Analytics,
    Game: Game,
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    hydrateState: hydrateState,
    rebuildFromTelemetry: rebuildFromTelemetry,
    readSaveRaw: readSaveRaw,
    writeSave: writeSave,
    clearSave: clearSave,
    buildingCost: buildingCost,
    terrainAt: terrainAt,
    hutTitle: hutTitle,
    roomTitle: roomTitle,
    visualSig: visualSig,
    generateWorldSeed: generateWorldSeed,
    cooldownLeft: cooldownLeft,
    cooldownReady: cooldownReady,
    setCooldown: setCooldown,
    syncCooldowns: syncCooldowns,
    adoptCooldowns: adoptCooldowns
  };
});
