/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * Remake of A Dark Room — Michael Townsend / doublespeak games. */
(function (root, factory) {
  var adr = factory();
  if (typeof module === "object" && module.exports) module.exports = adr;
  if (root) root.ADR = adr;
  return adr;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ITEMS = ["wood", "fur", "meat", "scales", "teeth", "cloth", "bait", "charm", "compass", "cured_meat", "leather", "iron", "coal", "steel", "sulphur", "bullets", "torch", "waterskin", "cask", "water_tank", "bone_spear", "rucksack", "wagon", "convoy", "l_armour", "i_armour", "s_armour", "iron_sword", "steel_sword", "rifle", "medicine", "energy_cell", "bolas", "grenade", "bayonet", "alien_alloy", "laser_rifle", "plasma_rifle", "energy_blade", "disruptor", "fluid_recycler", "cargo_drone", "kinetic_armour", "hypo", "stim", "glowstone", "fleet_beacon", "hypo_blueprint", "kinetic_armour_blueprint", "disruptor_blueprint", "plasma_rifle_blueprint", "stim_blueprint", "glowstone_blueprint"];
  var AREAS = ["room", "outside", "path", "world", "ship", "space", "fabricator"];
  var NPCS = ["builder", "nomad", "villagers"];
  var MOODS = ["unknown", "collapsed", "shivering", "sleeping", "helping", "neutral", "wary", "grateful"];
  var FIRE = ["熄灭了", "开始冒烟", "冒出火苗", "燃烧着", "熊熊燃烧"];
  var TEMP = ["寒冷刺骨", "很冷", "很宜人", "暖和", "很热"];
  var ITEM_CN = {
    wood: "木头", fur: "毛皮", meat: "肉", scales: "鳞片", teeth: "牙齿",
    cloth: "布料", bait: "诱饵", charm: "符咒", compass: "罗盘", cured_meat: "熏肉",
    leather: "皮革", iron: "铁", coal: "煤", steel: "钢", sulphur: "硫磺", bullets: "子弹",
    torch: "火把", waterskin: "水壶", cask: "水桶", water_tank: "水罐", bone_spear: "骨枪",
    rucksack: "双肩包", wagon: "篷车", convoy: "车队", l_armour: "皮甲", i_armour: "铁甲",
    s_armour: "钢甲", iron_sword: "铁剑", steel_sword: "钢剑", rifle: "步枪",
    medicine: "药剂", energy_cell: "能量元件", bolas: "套索", grenade: "手雷",
    bayonet: "刺刀", alien_alloy: "外星合金",
    laser_rifle: "激光步枪", plasma_rifle: "等离子步枪", energy_blade: "能量刃", disruptor: "扰乱器",
    fluid_recycler: "流体回收器", cargo_drone: "货运无人机", kinetic_armour: "动能护甲",
    hypo: "针剂", stim: "兴奋剂", glowstone: "辉光石", fleet_beacon: "舰队信标",
    hypo_blueprint: "针剂蓝图", kinetic_armour_blueprint: "动能护甲蓝图",
    disruptor_blueprint: "扰乱器蓝图", plasma_rifle_blueprint: "等离子步枪蓝图",
    stim_blueprint: "兴奋剂蓝图", glowstone_blueprint: "辉光石蓝图"
  };
  var BUILDING_CN = {
    trap: "陷阱", cart: "货车", hut: "小屋", lodge: "狩猎小屋", trading_post: "贸易站",
    tannery: "制革屋", smokehouse: "熏肉房", workshop: "工坊", steelworks: "炼钢坊", armoury: "军械坊",
    iron_mine: "铁矿", coal_mine: "煤矿", sulphur_mine: "硫磺矿"
  };
  var WORKER_CN = {
    gatherer: "伐木者", hunter: "猎人", trapper: "陷阱师", tanner: "皮革师", charcutier: "熏肉师",
    iron_miner: "铁矿工人", coal_miner: "煤矿工人", sulphur_miner: "硫磺矿工",
    steelworker: "炼钢工人", armourer: "军械工人"
  };
  var BUILDABLE = ["trap", "cart", "hut", "lodge", "trading_post", "tannery", "smokehouse", "workshop", "steelworks", "armoury"];
  var BUILDING_KEYS = ["trap", "cart", "hut", "lodge", "trading_post", "tannery", "smokehouse", "workshop", "steelworks", "armoury", "iron_mine", "coal_mine", "sulphur_mine"];
  var WORKER_KEYS = ["gatherer", "hunter", "trapper", "tanner", "charcutier", "iron_miner", "coal_miner", "sulphur_miner", "steelworker", "armourer"];
  var JOB_BUILDING = {
    hunter: "lodge", trapper: "lodge", tanner: "tannery", charcutier: "smokehouse",
    iron_miner: "iron_mine", coal_miner: "coal_mine", sulphur_miner: "sulphur_mine",
    steelworker: "steelworks", armourer: "armoury"
  };
  /* Faithful copy of script/outside.js _INCOME (delay 10s). Keys are snake_case. */
  var INCOME = {
    gatherer: { delay: 10, stores: { wood: 1 } },
    hunter: { delay: 10, stores: { fur: 0.5, meat: 0.5 } },
    trapper: { delay: 10, stores: { meat: -1, bait: 1 } },
    tanner: { delay: 10, stores: { fur: -5, leather: 1 } },
    charcutier: { delay: 10, stores: { meat: -5, wood: -5, cured_meat: 1 } },
    iron_miner: { delay: 10, stores: { cured_meat: -1, iron: 1 } },
    coal_miner: { delay: 10, stores: { cured_meat: -1, coal: 1 } },
    sulphur_miner: { delay: 10, stores: { cured_meat: -1, sulphur: 1 } },
    steelworker: { delay: 10, stores: { iron: -1, coal: -1, steel: 1 } },
    armourer: { delay: 10, stores: { steel: -1, sulphur: -1, bullets: 1 } }
  };
  var BUILD_AVAILABLE = {
    lodge: "villagers could help hunt, given the means",
    trading_post: "a trading post would make commerce easier",
    tannery: "builder says leather could be useful. says the villagers could make it.",
    smokehouse: "should cure the meat, or it'll spoil. builder says she can fix something up.",
    workshop: "builder says she could make finer things, if she had the tools",
    steelworks: "builder says the villagers could make steel, given the tools",
    armoury: "builder says it'd be useful to have a steady source of bullets"
  };
  var BUILD_DONE = {
    lodge: "the hunting lodge stands in the forest, a ways out of town",
    trading_post: "now the nomads have a place to set up shop, they might stick around a while",
    tannery: "tannery goes up quick, on the edge of the village",
    smokehouse: "builder finishes the smokehouse. she looks hungry.",
    workshop: "workshop's finally ready. builder's excited to get to it",
    steelworks: "a haze falls over the village as the steelworks fires up",
    armoury: "armoury's done, welcoming back the weapons of the past."
  };
  /* Faithful copy of script/room.js Craftables tools/weapons/upgrades (batch 2). Costs are n=0. */
  var CRAFTABLE = {
    torch: { type: "tool", cost: { wood: 1, cloth: 1 }, buildMsg: "a torch to keep the dark away" },
    waterskin: { type: "upgrade", max: 1, cost: { leather: 50 }, buildMsg: "this waterskin'll hold a bit of water, at least" },
    cask: { type: "upgrade", max: 1, cost: { leather: 100, iron: 20 }, buildMsg: "the cask holds enough water for longer expeditions" },
    water_tank: { type: "upgrade", max: 1, cost: { iron: 100, steel: 50 }, buildMsg: "never go thirsty again" },
    bone_spear: { type: "weapon", cost: { wood: 100, teeth: 5 }, buildMsg: "this spear's not elegant, but it's pretty good at stabbing" },
    rucksack: { type: "upgrade", max: 1, cost: { leather: 200 }, buildMsg: "carrying more means longer expeditions to the wilds" },
    wagon: { type: "upgrade", max: 1, cost: { wood: 500, iron: 100 }, buildMsg: "the wagon can carry a lot of supplies" },
    convoy: { type: "upgrade", max: 1, cost: { wood: 1000, iron: 200, steel: 100 }, buildMsg: "the convoy can haul mostly everything" },
    l_armour: { type: "upgrade", max: 1, cost: { leather: 200, scales: 20 }, buildMsg: "leather's not strong. better than rags, though." },
    i_armour: { type: "upgrade", max: 1, cost: { leather: 200, iron: 100 }, buildMsg: "iron's stronger than leather" },
    s_armour: { type: "upgrade", max: 1, cost: { leather: 200, steel: 100 }, buildMsg: "steel's stronger than iron" },
    iron_sword: { type: "weapon", cost: { wood: 200, leather: 50, iron: 20 }, buildMsg: "sword is sharp. good protection out in the wilds." },
    steel_sword: { type: "weapon", cost: { wood: 500, leather: 100, steel: 20 }, buildMsg: "the steel is strong, and the blade true." },
    rifle: { type: "weapon", cost: { wood: 200, steel: 50, sulphur: 50 }, buildMsg: "black powder and bullets, like the old days." }
  };
  var CRAFT_KEYS = Object.keys(CRAFTABLE);
  /* Faithful copy of script/fabricator.js Craftables (batch 8). */
  var FABRICABLE = {
    energy_blade: { type: "weapon", cost: { alien_alloy: 1 }, buildMsg: "the blade hums, charged particles sparking and fizzing." },
    fluid_recycler: { type: "upgrade", max: 1, cost: { alien_alloy: 2 }, buildMsg: "water out, water in. waste not, want not." },
    cargo_drone: { type: "upgrade", max: 1, cost: { alien_alloy: 2 }, buildMsg: "the workhorse of the wanderer fleet." },
    kinetic_armour: { type: "upgrade", max: 1, blueprint: true, cost: { alien_alloy: 2 }, buildMsg: "wanderer soldiers succeed by subverting the enemy's rage." },
    disruptor: { type: "weapon", blueprint: true, cost: { alien_alloy: 1 }, buildMsg: "somtimes it is best not to fight." },
    hypo: { type: "tool", blueprint: true, quantity: 5, cost: { alien_alloy: 1 }, buildMsg: "a handful of hypos. life in a vial." },
    stim: { type: "tool", blueprint: true, cost: { alien_alloy: 1 }, buildMsg: "sometimes it is best to fight without restraint." },
    plasma_rifle: { type: "weapon", blueprint: true, cost: { alien_alloy: 1 }, buildMsg: "the peak of wanderer weapons technology, sleek and deadly." },
    glowstone: { type: "tool", blueprint: true, cost: { alien_alloy: 1 }, buildMsg: "a smooth, perfect sphere. its light is inextinguishable." }
  };
  var FABRICATE_KEYS = Object.keys(FABRICABLE);
  var BLUEPRINT_REDEEM = {
    hypo_blueprint: "hypo",
    kinetic_armour_blueprint: "kinetic_armour",
    disruptor_blueprint: "disruptor",
    plasma_rifle_blueprint: "plasma_rifle",
    stim_blueprint: "stim",
    glowstone_blueprint: "glowstone"
  };
  /* Faithful copy of script/room.js TradeGoods (n=0). Compass is always listed once a trading post exists; others after the store has been seen. */
  var TRADEABLE = {
    scales: { type: "good", cost: { fur: 150 } },
    teeth: { type: "good", cost: { fur: 300 } },
    iron: { type: "good", cost: { fur: 150, scales: 50 } },
    coal: { type: "good", cost: { fur: 200, teeth: 50 } },
    steel: { type: "good", cost: { fur: 300, scales: 50, teeth: 50 } },
    medicine: { type: "good", cost: { scales: 50, teeth: 30 } },
    bullets: { type: "good", cost: { scales: 10 } },
    energy_cell: { type: "good", cost: { scales: 10, teeth: 10 } },
    bolas: { type: "weapon", cost: { teeth: 10 } },
    grenade: { type: "weapon", cost: { scales: 100, teeth: 50 } },
    bayonet: { type: "weapon", cost: { scales: 500, teeth: 250 } },
    alien_alloy: { type: "good", cost: { fur: 1500, scales: 750, teeth: 300 } },
    compass: { type: "special", max: 1, cost: { fur: 400, scales: 20, teeth: 10 } }
  };
  var TRADE_KEYS = Object.keys(TRADEABLE);
  /* Faithful copy of script/world.js constants (batch 5). */
  var RADIUS = 30;
  var STICKINESS = 0.5;
  var LIGHT_RADIUS = 2;
  var BASE_WATER = 10;
  var MOVES_PER_FOOD = 2;
  var MOVES_PER_WATER = 1;
  var DEATH_COOLDOWN = 120;
  var FIGHT_CHANCE = 0.20;
  var BASE_HEALTH = 10;
  var BASE_HIT_CHANCE = 0.8;
  var MEAT_HEAL = 8;
  var MEDS_HEAL = 20;
  var HYPO_HEAL = 30;
  var FIGHT_DELAY = 3;
  var WORLD_SIZE = RADIUS * 2 + 1;
  var VILLAGE_X = RADIUS;
  var VILLAGE_Y = RADIUS;
  /* Faithful copy of script/ship.js + script/space.js (batch 7). */
  var LIFTOFF_COOLDOWN = 120;
  var ALLOY_PER_HULL = 1;
  var ALLOY_PER_THRUSTER = 1;
  var BASE_HULL = 0;
  var BASE_THRUSTERS = 1;
  var SHIP_SPEED = 3;
  var BASE_ASTEROID_DELAY = 500;
  var BASE_ASTEROID_SPEED = 1500;
  var FTB_SPEED = 60000;
  var SPACE_WIDTH = 700;
  var SPACE_HEIGHT = 700;
  var ASTEROID_GLYPHS = ["#", "$", "%", "&", "H"];
  /* Faithful copy of script/world.js Weapons. */
  var WEAPONS = {
    fists: { verb: "punch", type: "unarmed", damage: 1, cooldown: 2 },
    bone_spear: { verb: "stab", type: "melee", damage: 2, cooldown: 2 },
    iron_sword: { verb: "swing", type: "melee", damage: 4, cooldown: 2 },
    steel_sword: { verb: "slash", type: "melee", damage: 6, cooldown: 2 },
    bayonet: { verb: "thrust", type: "melee", damage: 8, cooldown: 2 },
    rifle: { verb: "shoot", type: "ranged", damage: 5, cooldown: 1, cost: { bullets: 1 } },
    laser_rifle: { verb: "blast", type: "ranged", damage: 8, cooldown: 1, cost: { energy_cell: 1 } },
    grenade: { verb: "lob", type: "ranged", damage: 15, cooldown: 5, cost: { grenade: 1 } },
    bolas: { verb: "tangle", type: "ranged", damage: "stun", cooldown: 15, cost: { bolas: 1 } },
    plasma_rifle: { verb: "disintegrate", type: "ranged", damage: 12, cooldown: 1, cost: { energy_cell: 1 } },
    energy_blade: { verb: "slice", type: "melee", damage: 10, cooldown: 2 },
    disruptor: { verb: "stun", type: "ranged", damage: "stun", cooldown: 15 }
  };
  /* Faithful copy of script/engine.js Perks (name / desc / notify). */
  var PERKS = {
    boxer: { name: "boxer", desc: "punches do more damage", notify: "learned to throw punches with purpose" },
    martial_artist: { name: "martial artist", desc: "punches do even more damage.", notify: "learned to fight quite effectively without weapons" },
    unarmed_master: { name: "unarmed master", desc: "punch twice as fast, and with even more force", notify: "learned to strike faster without weapons" },
    barbarian: { name: "barbarian", desc: "melee weapons deal more damage", notify: "learned to swing weapons with force" },
    slow_metabolism: { name: "slow metabolism", desc: "go twice as far without eating", notify: "learned how to ignore the hunger" },
    desert_rat: { name: "desert rat", desc: "go twice as far without drinking", notify: "learned to love the dry air" },
    evasive: { name: "evasive", desc: "dodge attacks more effectively", notify: "learned to be where they're not" },
    precise: { name: "precise", desc: "land blows more often", notify: "learned to predict their movement" },
    scout: { name: "scout", desc: "see farther", notify: "learned to look ahead" },
    stealthy: { name: "stealthy", desc: "better avoid conflict in the wild", notify: "learned how not to be seen" },
    gastronome: { name: "gastronome", desc: "restore more health when eating", notify: "learned to make the most of food" }
  };
  var PERK_KEYS = Object.keys(PERKS);

  function emptyPerks() {
    var p = {};
    PERK_KEYS.forEach(function (k) { p[k] = false; });
    return p;
  }
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
    "craft:": "制造:",
    "buy:": "购买:",
    "medicine": "药剂",
    "energy cell": "能量元件",
    "bolas": "套索",
    "grenade": "手雷",
    "bayonet": "刺刀",
    "alien alloy": "外星合金",
    "stores": "库存",
    "torch": "火把",
    "a torch to keep the dark away": "驱散黑暗的火把",
    "waterskin": "水壶",
    "this waterskin'll hold a bit of water, at least": "起码能装那么点儿水",
    "cask": "水桶",
    "the cask holds enough water for longer expeditions": "为更长的探索之旅提供充足的水源",
    "water tank": "水罐",
    "never go thirsty again": "再也不担心口渴",
    "bone spear": "骨枪",
    "this spear's not elegant, but it's pretty good at stabbing": "这柄标枪不怎么精致，但用来戳刺手感不错",
    "rucksack": "双肩包",
    "carrying more means longer expeditions to the wilds": "荒野旅行时携带更多物资",
    "wagon": "篷车",
    "the wagon can carry a lot of supplies": "篷车能够携带许多物资",
    "convoy": "车队",
    "the convoy can haul mostly everything": "车队几乎能把所有东西都装下",
    "l armour": "皮甲",
    "leather's not strong. better than rags, though.": "皮革不算结实。总比披块破布强",
    "i armour": "铁甲",
    "iron's stronger than leather": "铁比皮要结实",
    "s armour": "钢甲",
    "steel's stronger than iron": "钢的总比铁的强",
    "iron sword": "铁剑",
    "sword is sharp. good protection out in the wilds.": "剑很锋利。能在野外提供不错的防护",
    "steel sword": "钢剑",
    "the steel is strong, and the blade true.": "好钢出利刃",
    "rifle": "步枪",
    "black powder and bullets, like the old days.": "黑火药和子弹，就像过去那样",
    "none": "无",
    "armour": "护甲",
    "leather": "皮革",
    "iron": "铁",
    "steel": "钢",
    "water": "水",
    "free {0}/{1}": "余量 {0}/{1}",
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
    "lodge": "狩猎小屋",
    "villagers could help hunt, given the means": "假如工具齐备，村民也能帮忙狩猎",
    "the hunting lodge stands in the forest, a ways out of town": "狩猎小屋已经矗立在林中，距离村子不远",
    "trading post": "贸易站",
    "a trading post would make commerce easier": "贸易站让贸易变得更加便捷",
    "now the nomads have a place to set up shop, they might stick around a while": "现在游牧部落有地方安营扎寨设立商铺了，他们也许会多逗留一段时间",
    "tannery": "制革屋",
    "builder says leather could be useful. says the villagers could make it.": "建造者说皮革会很有用，而且村民也会做",
    "tannery goes up quick, on the edge of the village": "制革屋很快在村子一角建立了起来",
    "smokehouse": "熏肉房",
    "should cure the meat, or it'll spoil. builder says she can fix something up.": "应该把肉熏一下，否则会腐坏掉。建造者说她能搞定这个。",
    "builder finishes the smokehouse. she looks hungry.": "建造者造好了熏肉房。她看起来饥肠辘辘。",
    "workshop": "工坊",
    "builder says she could make finer things, if she had the tools": "建造者说如果她有工具的话能做出一些更精良的东西",
    "workshop's finally ready. builder's excited to get to it": "工坊终于建好了，建造者激动不已",
    "steelworks": "炼钢坊",
    "builder says the villagers could make steel, given the tools": "建造者说给村民工具的话他们就能帮忙炼钢",
    "a haze falls over the village as the steelworks fires up": "炼钢坊开工后，一缕黑烟飘向村庄上空",
    "armoury": "军械坊",
    "builder says it'd be useful to have a steady source of bullets": "建造者说拥有稳定的弹药来源很有必要",
    "armoury's done, welcoming back the weapons of the past.": "军械坊建好了，欢迎使用这些过时的武器",
    "gatherer": "伐木者",
    "hunter": "猎人",
    "trapper": "陷阱师",
    "tanner": "皮革师",
    "charcutier": "熏肉师",
    "iron miner": "铁矿工人",
    "coal miner": "煤矿工人",
    "sulphur miner": "硫磺矿工",
    "steelworker": "炼钢工人",
    "armourer": "军械工人",
    "boxer": "拳击手",
    "punches do more damage": "徒手伤害翻倍",
    "learned to throw punches with purpose": "学会了有意识地出拳",
    "martial artist": "武斗家",
    "punches do even more damage.": "徒手造成更多的伤害",
    "learned to fight quite effectively without weapons": "学会了高效率的徒手搏击",
    "unarmed master": "徒手宗师",
    "punch twice as fast, and with even more force": "出拳速度翻倍，力道也更大",
    "learned to strike faster without weapons": "学会了如何更快速地出拳",
    "barbarian": "野蛮人",
    "melee weapons deal more damage": "近战武器造成更高伤害",
    "learned to swing weapons with force": "学会了如何发挥劲力，挥舞武器",
    "slow metabolism": "减缓代谢",
    "go twice as far without eating": "不吃东西能坚持走的距离翻倍",
    "learned how to ignore the hunger": "学会如何忍饥挨饿",
    "desert rat": "荒漠跳鼠",
    "go twice as far without drinking": "不喝水能坚持走的距离翻倍",
    "learned to love the dry air": "无畏干燥",
    "evasive": "避实就虚",
    "dodge attacks more effectively": "更有效的闪避攻击",
    "learned to be where they're not": "学会了闪避攻击",
    "precise": "精密",
    "land blows more often": "命中率提高",
    "learned to predict their movement": "学会预判他人的动作",
    "scout": "侦查术",
    "see farther": "看得更远",
    "learned to look ahead": "强化视野",
    "stealthy": "潜行",
    "better avoid conflict in the wild": "更好地回避荒野中的冲突",
    "learned how not to be seen": "学会了隐匿身形",
    "gastronome": "美食家",
    "restore more health when eating": "进食恢复更多生命",
    "learned to make the most of food": "学会充分消化食物",
    "laser rifle": "激光步枪",
    "plasma rifle": "等离子步枪",
    "energy blade": "能量刃",
    "disruptor": "扰乱器",
    "A Two-Headed Creature": "双头怪物",
    "two-headed creature": "双头怪物",
    "the two creatures are dead": "那两个生物倒下了",
    "a two-headed creature appears, the smaller head trembling": "一只双头怪物出现了，较小的那颗头在发抖",
    "Ship": "飞船",
    "An Old Starship": "破旧星舰",
    "hull:": "外壳:",
    "engine:": "引擎:",
    "reinforce hull": "加固船身",
    "upgrade engine": "升级引擎",
    "lift off": "点火起飞",
    "somewhere above the debris cloud, the wanderer fleet hovers. been on this rock too long.": "碎片云上方的某处，流浪者舰队徘徊着。在这块岩石上太久了。",
    "not enough alien alloy": "外星合金不足",
    "Ready to Leave?": "准备好要离开了吗?",
    "time to get out of this place. won't be coming back.": "是时候离开这里了。不再回头",
    "linger": "裹足徘徊",
    "hull: ": "船身:",
    "Troposphere": "对流层",
    "Stratosphere": "平流层",
    "Mesosphere": "中气层",
    "Thermosphere": "增温层",
    "Exosphere": "外逸层",
    "Space": "太空",
    "Fabricator": "制造机",
    "A Whirring Fabricator": "嗡鸣制造机",
    "fabricate:": "制造:",
    "blueprints": "蓝图",
    "energy blade": "能量刃",
    "fluid recycler": "流体回收器",
    "cargo drone": "货运无人机",
    "kinetic armour": "动能护甲",
    "hypo": "针剂",
    "stim": "兴奋剂",
    "glow stone": "辉光石",
    "fleet beacon": "舰队信标",
    "hypo blueprint": "针剂蓝图",
    "kinetic armour blueprint": "动能护甲蓝图",
    "disruptor blueprint": "扰乱器蓝图",
    "plasma rifle blueprint": "等离子步枪蓝图",
    "stim blueprint": "兴奋剂蓝图",
    "glowstone blueprint": "辉光石蓝图",
    "the blade hums, charged particles sparking and fizzing.": "刃身嗡鸣，带电微粒噼啪作响",
    "water out, water in. waste not, want not.": "水出，水进。物尽其用",
    "the workhorse of the wanderer fleet.": "流浪者舰队的驮马",
    "wanderer soldiers succeed by subverting the enemy's rage.": "流浪者士兵靠化解敌人的怒火取胜",
    "somtimes it is best not to fight.": "有时候，不打才是上策",
    "a handful of hypos. life in a vial.": "几支针剂。小瓶里的性命",
    "sometimes it is best to fight without restraint.": "有时候，该放手一搏",
    "the peak of wanderer weapons technology, sleek and deadly.": "流浪者武器技术的巅峰，流畅而致命",
    "a smooth, perfect sphere. its light is inextinguishable.": "一颗光滑完美的球体。它的光无法熄灭",
    "the familiar hum of wanderer machinery coming to life. finally, real tools.": "熟悉的流浪者机械嗡鸣苏醒了。终于，真正的工具",
    "builder knows the strange device when she sees it. takes it for herself real quick. doesn’t ask where it came from.": "建造者一眼认出那件古怪装置。她很快据为己有。也不问从哪来的",
    "blueprints feed into the fabricator data port. possibilities grow.": "蓝图送进制造机数据口。可能性在增长"
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
      buildings: { trap: 0, cart: 0, hut: 0, lodge: 0, trading_post: 0, tannery: 0, smokehouse: 0, workshop: 0, steelworks: 0, armoury: 0, iron_mine: 0, coal_mine: 0, sulphur_mine: 0 },
      population: 0,
      workers: { gatherer: 0, hunter: 0, trapper: 0, tanner: 0, charcutier: 0, iron_miner: 0, coal_miner: 0, sulphur_miner: 0, steelworker: 0, armourer: 0 },
      seen: {},
      unlocked: { room: true, outside: false, path: false, world: false, ship: false, space: false, fabricator: false },
      blueprints: { hypo: false, kinetic_armour: false, disruptor: false, plasma_rifle: false, stim: false, glowstone: false },
      location: "room",
      spaceShip: { hull: BASE_HULL, thrusters: BASE_THRUSTERS, seenShip: false, seenWarning: false },
      space: null,
      phase: "room_dark",
      flags: {},
      notifications: [],
      cooldowns: {},
      cooldown_ends_at: {},
      income_acc: { builder: 0, gatherer: 0, hunter: 0, trapper: 0, tanner: 0, charcutier: 0, iron_miner: 0, coal_miner: 0, sulphur_miner: 0, steelworker: 0, armourer: 0 },
      pop_timer: null,
      event_timer: null,
      scheduled: [],
      active_event: null,
      combat: null,
      perks: emptyPerks(),
      punches: 0,
      outfit: { meat: 0, cured_meat: 0 },
      world: {
        on_expedition: false,
        size: WORLD_SIZE,
        x: VILLAGE_X,
        y: VILLAGE_Y,
        water: BASE_WATER,
        hp: BASE_HEALTH,
        max_hp: BASE_HEALTH,
        food_moves: 0,
        water_moves: 0,
        fight_moves: 0,
        visited: {},
        cleared: {},
        landmarks: { "33,28": "old_house", "27,24": "cave", "42,28": "town", "30,52": "city", "36,33": "outpost", "58,30": "ship", "14,30": "borehole", "30,12": "battlefield", "40,40": "swamp", "20,24": "cache", "2,30": "executioner", "35,30": "ironmine", "30,40": "coalmine", "50,30": "sulphurmine" },
        outposts_used: {},
        seen_danger: false
      },
      slice_complete: false
    };
  }

  var SAVE_KEY = "adr.save.v1";
  var SAVE_VERSION = 1;
  var OBJECT_KEYS = ["stores", "buildings", "unlocked", "npc_moods", "workers", "outfit", "income_acc", "world", "flags", "cooldowns", "cooldown_ends_at", "seen", "perks", "spaceShip", "blueprints"];
  var ARRAY_KEYS = ["notifications", "scheduled"];
  var NUMBER_KEYS = ["fire", "temperature", "game_time_sec", "builder_level", "population", "punches"];

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
          base.world.cleared = (saved.world && saved.world.cleared) || {};
          base.world.landmarks = (saved.world && saved.world.landmarks) || base.world.landmarks;
          base.world.outposts_used = (saved.world && saved.world.outposts_used) || {};
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
    return migrateState(base);
  }

  function migrateState(state) {
    if (!isPlainObject(state.seen)) state.seen = {};
    ITEMS.forEach(function (k) {
      if (typeof state.stores[k] !== "number" || !isFinite(state.stores[k])) state.stores[k] = 0;
      if (state.stores[k] > 0) state.seen[k] = true;
    });
    if (state.wood_initialized) state.seen.wood = true;
    BUILDING_KEYS.forEach(function (k) {
      if (typeof state.buildings[k] !== "number" || !isFinite(state.buildings[k])) state.buildings[k] = 0;
    });
    WORKER_KEYS.forEach(function (k) {
      if (typeof state.workers[k] !== "number" || !isFinite(state.workers[k])) state.workers[k] = 0;
    });
    if (typeof state.income_acc.builder !== "number") state.income_acc.builder = 0;
    if (typeof state.income_acc.thieves !== "number") state.income_acc.thieves = 0;
    if (state.flags.stolen && !isPlainObject(state.flags.stolen)) state.flags.stolen = {};
    Object.keys(INCOME).forEach(function (k) {
      if (typeof state.income_acc[k] !== "number") state.income_acc[k] = 0;
    });
    if (!isPlainObject(state.perks)) state.perks = emptyPerks();
    PERK_KEYS.forEach(function (k) {
      if (typeof state.perks[k] !== "boolean") state.perks[k] = !!state.perks[k];
    });
    ["evasive", "precise", "barbarian", "scout", "stealthy"].forEach(function (k) {
      if (state.flags["learned_" + k]) state.perks[k] = true;
    });
    if (typeof state.punches !== "number") state.punches = 0;
    if (!isPlainObject(state.world)) state.world = {};
    if ((state.world.size || 11) !== WORLD_SIZE) {
      var oldSize = state.world.size || 11;
      var oldCx = Math.floor(oldSize / 2);
      var shiftX = VILLAGE_X - oldCx;
      var shiftY = VILLAGE_Y - oldCx;
      state.world.x = (typeof state.world.x === "number" ? state.world.x : oldCx) + shiftX;
      state.world.y = (typeof state.world.y === "number" ? state.world.y : oldCx) + shiftY;
      var visited = {};
      Object.keys(state.world.visited || {}).forEach(function (k) {
        var p = k.split(",");
        visited[(Number(p[0]) + shiftX) + "," + (Number(p[1]) + shiftY)] = true;
      });
      state.world.visited = visited;
      var lms = {};
      Object.keys(state.world.landmarks || {}).forEach(function (k) {
        var p = k.split(",");
        lms[(Number(p[0]) + shiftX) + "," + (Number(p[1]) + shiftY)] = state.world.landmarks[k];
      });
      state.world.landmarks = lms;
      state.world.size = WORLD_SIZE;
    }
    if (!isPlainObject(state.world.landmarks)) state.world.landmarks = {};
    var defaultLandmarks = { "33,28": "old_house", "27,24": "cave", "42,28": "town", "30,52": "city", "36,33": "outpost", "58,30": "ship", "14,30": "borehole", "30,12": "battlefield", "40,40": "swamp", "20,24": "cache", "2,30": "executioner", "35,30": "ironmine", "30,40": "coalmine", "50,30": "sulphurmine" };
    Object.keys(defaultLandmarks).forEach(function (k) {
      if (!state.world.landmarks[k]) state.world.landmarks[k] = defaultLandmarks[k];
    });
    if (!isPlainObject(state.world.outposts_used)) state.world.outposts_used = {};
    if (!isPlainObject(state.world.cleared)) state.world.cleared = {};
    if (typeof state.world.fight_moves !== "number") state.world.fight_moves = 0;
    if (typeof state.world.water_moves !== "number") state.world.water_moves = 0;
    unlockWorkersForBuildings(state);
    syncGatherers(state);
    ensureSpaceShip(state);
    if (state.flags.world_ship && state.world && !state.world.on_expedition) {
      state.unlocked.ship = true;
      state.unlocked.space = true;
    }
    if (!isPlainObject(state.blueprints)) state.blueprints = {};
    Object.keys(BLUEPRINT_REDEEM).forEach(function (bp) {
      var item = BLUEPRINT_REDEEM[bp];
      if (typeof state.blueprints[item] !== "boolean") state.blueprints[item] = !!state.blueprints[item];
    });
    if (typeof state.unlocked.fabricator !== "boolean") state.unlocked.fabricator = !!state.unlocked.fabricator;
    if (state.flags.world_executioner && state.world && !state.world.on_expedition) {
      state.unlocked.fabricator = true;
    }
    if (state.location === "space" && (!state.space || !state.space.active)) {
      state.location = state.unlocked.ship ? "ship" : "path";
    }
    return state;
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
    if (amount > 0) {
      if (!state.seen) state.seen = {};
      state.seen[item] = true;
    }
  }

  function visualSig(state) {
    var n0 = state.notifications[0];
    var ev = state.active_event;
    return [
      state.location, state.fire, state.temperature, state.builder_level,
      state.stores.wood, state.stores.fur, state.stores.meat, state.stores.compass,
      state.buildings.trap, state.buildings.cart, state.buildings.hut,
      state.buildings.lodge, state.buildings.smokehouse, state.buildings.tannery,
      state.buildings.trading_post, state.buildings.workshop, state.buildings.steelworks, state.buildings.armoury,
      JSON.stringify(state.workers),
      state.stores.leather, state.stores.cured_meat, state.stores.iron, state.stores.coal, state.stores.steel, state.stores.sulphur,
      state.stores.torch, state.stores.waterskin, state.stores.cask, state.stores.water_tank,
      state.stores.bone_spear, state.stores.rucksack, state.stores.wagon, state.stores.convoy,
      state.stores.l_armour, state.stores.i_armour, state.stores.s_armour,
      state.stores.iron_sword, state.stores.steel_sword, state.stores.rifle,
      state.stores.medicine, state.stores.energy_cell, state.stores.bolas,
      state.stores.grenade, state.stores.bayonet, state.stores.alien_alloy,
      state.population, state.unlocked.outside ? 1 : 0, state.unlocked.path ? 1 : 0,
      state.notifications.length, n0 ? n0.text : "", n0 ? (n0.count || 1) : "",
      ev ? ev.id : "", ev ? ev.scene : "",
      state.combat ? state.combat.hp : "",
      state.phase, state.slice_complete ? 1 : 0,
      state.world.on_expedition ? 1 : 0, state.world.x, state.world.y,
      state.world.hp, state.world.water,
      state.outfit.meat, state.outfit.cured_meat,
      state.unlocked.ship ? 1 : 0,
      state.unlocked.fabricator ? 1 : 0,
      JSON.stringify(state.blueprints),
      state.stores.laser_rifle, state.stores.energy_blade, state.stores.disruptor,
      state.stores.plasma_rifle, state.stores.fluid_recycler, state.stores.cargo_drone,
      state.stores.kinetic_armour, state.stores.hypo, state.stores.stim, state.stores.glowstone,
      state.stores.fleet_beacon,
      state.spaceShip ? state.spaceShip.hull : "",
      state.spaceShip ? state.spaceShip.thrusters : "",
      state.space ? state.space.altitude : "",
      state.space ? state.space.hull : "",
      state.space ? (state.space.asteroids || []).length : 0,
      state.flags.space_escaped ? 1 : 0
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

  function derivePhase(state) {
    if (state.slice_complete) return "slice_complete";
    if (state.world.on_expedition) return "world";
    if (state.unlocked.path) return "path";
    if (state.buildings.hut > 0) return "village";
    if (state.unlocked.outside) return "forest";
    if (state.builder_level >= 1) return "stranger";
    if (state.fire > 0) return "room_fire";
    return "room_dark";
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
        if (a.area === "ship" || a.area === "space") {
          ensureSpaceShip(state);
          state.unlocked.ship = true;
          state.unlocked.space = true;
        }
        if (a.area === "fabricator") state.unlocked.fabricator = true;
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
        var startScene = (spec.scenes && spec.scenes.start) ? spec.scenes.start : spec;
        applySceneEffects(state, startScene);
        if (startScene.combat || spec.combat) beginCombat(state, startScene.combat ? startScene : spec);
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

  function buildingMax(kind) {
    if (kind === "trap") return 10;
    if (kind === "hut") return 20;
    if (kind === "cart") return 1;
    if (kind === "lodge") return 1;
    if (kind === "trading_post") return 1;
    if (kind === "tannery") return 1;
    if (kind === "smokehouse") return 1;
    if (kind === "workshop") return 1;
    if (kind === "steelworks") return 1;
    if (kind === "armoury") return 1;
    return 0;
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
    // @pacing kind=cost id=lodge value=200wood+10fur+5meat phase=village
    if (kind === "lodge") return { wood: 200, fur: 10, meat: 5 };
    // @pacing kind=cost id=trading_post value=400wood+100fur phase=village
    if (kind === "trading_post") return { wood: 400, fur: 100 };
    // @pacing kind=cost id=tannery value=500wood+50fur phase=village
    if (kind === "tannery") return { wood: 500, fur: 50 };
    // @pacing kind=cost id=smokehouse value=600wood+50meat phase=village
    if (kind === "smokehouse") return { wood: 600, meat: 50 };
    // @pacing kind=cost id=workshop value=800wood+100leather+10scales phase=village
    if (kind === "workshop") return { wood: 800, leather: 100, scales: 10 };
    // @pacing kind=cost id=steelworks value=1500wood+100iron+100coal phase=village
    if (kind === "steelworks") return { wood: 1500, iron: 100, coal: 100 };
    // @pacing kind=cost id=armoury value=3000wood+100steel+50sulphur phase=village
    if (kind === "armoury") return { wood: 3000, steel: 100, sulphur: 50 };
    return null;
  }

  function needsWorkshop(type) {
    return type === "weapon" || type === "upgrade" || type === "tool";
  }

  function craftCost(kind) {
    var spec = CRAFTABLE[kind];
    if (!spec || !spec.cost) return null;
    var out = {};
    Object.keys(spec.cost).forEach(function (k) { out[k] = spec.cost[k]; });
    return out;
  }

  function craftMax(kind) {
    var spec = CRAFTABLE[kind];
    if (!spec) return 0;
    return spec.max || 0;
  }

  function itemWeight(item) {
    if (item === "bone_spear") return 2;
    if (item === "iron_sword") return 3;
    if (item === "steel_sword") return 5;
    if (item === "rifle" || item === "laser_rifle" || item === "plasma_rifle") return 5;
    if (item === "energy_blade") return 2;
    if (item === "disruptor") return 2;
    if (item === "bullets") return 0.1;
    if (item === "energy_cell") return 0.2;
    if (item === "bolas") return 0.5;
    return 1;
  }

  function tradeCost(kind) {
    var spec = TRADEABLE[kind];
    if (!spec || !spec.cost) return null;
    var out = {};
    Object.keys(spec.cost).forEach(function (k) { out[k] = spec.cost[k]; });
    return out;
  }

  function tradeMax(kind) {
    var spec = TRADEABLE[kind];
    if (!spec) return 0;
    return spec.max || 0;
  }

  function buyVisible(state, kind) {
    if ((state.buildings.trading_post || 0) <= 0) return false;
    if (!TRADEABLE[kind]) return false;
    if (kind === "compass") return true;
    if (state.flags["buy_unlocked_" + kind] || (state.seen && state.seen[kind])) return true;
    return false;
  }

  function checkBuyUnlocks(state) {
    if ((state.buildings.trading_post || 0) <= 0) return;
    TRADE_KEYS.forEach(function (kind) {
      if (state.flags["buy_unlocked_" + kind]) return;
      if (!buyVisible(state, kind)) return;
      state.flags["buy_unlocked_" + kind] = true;
    });
  }

  function bagCapacity(state) {
    if ((state.stores.cargo_drone || 0) > 0) return 110;
    if ((state.stores.convoy || 0) > 0) return 70;
    if ((state.stores.wagon || 0) > 0) return 40;
    if ((state.stores.rucksack || 0) > 0) return 20;
    return 10;
  }

  function bagUsed(state) {
    var n = 0;
    var k;
    for (k in state.outfit) n += (state.outfit[k] || 0) * itemWeight(k);
    return n;
  }

  function getMaxWater(state) {
    if ((state.stores.fluid_recycler || 0) > 0) return BASE_WATER + 100;
    if ((state.stores.water_tank || 0) > 0) return BASE_WATER + 50;
    if ((state.stores.cask || 0) > 0) return BASE_WATER + 20;
    if ((state.stores.waterskin || 0) > 0) return BASE_WATER + 10;
    return BASE_WATER;
  }

  function getMaxHealth(state) {
    if ((state.stores.kinetic_armour || 0) > 0) return BASE_HEALTH + 75;
    if ((state.stores.s_armour || 0) > 0) return BASE_HEALTH + 35;
    if ((state.stores.i_armour || 0) > 0) return BASE_HEALTH + 15;
    if ((state.stores.l_armour || 0) > 0) return BASE_HEALTH + 5;
    return BASE_HEALTH;
  }

  function hasBlueprint(state, item) {
    return !!(state.blueprints && state.blueprints[item]);
  }

  function canFabricate(state, kind) {
    var spec = FABRICABLE[kind];
    if (!spec) return false;
    if (spec.blueprint && !hasBlueprint(state, kind)) return false;
    return true;
  }

  function fabricateCost(kind) {
    var spec = FABRICABLE[kind];
    if (!spec || !spec.cost) return null;
    var out = {};
    Object.keys(spec.cost).forEach(function (k) { out[k] = spec.cost[k]; });
    return out;
  }

  function redeemBlueprints(state) {
    var redeemed = false;
    Object.keys(BLUEPRINT_REDEEM).forEach(function (bp) {
      if ((state.outfit[bp] || 0) > 0) {
        if (!state.blueprints) state.blueprints = {};
        state.blueprints[BLUEPRINT_REDEEM[bp]] = true;
        state.outfit[bp] = 0;
        redeemed = true;
      }
    });
    if (redeemed) pushNote(state, t("blueprints feed into the fabricator data port. possibilities grow."), "path");
    return redeemed;
  }

  function assignedWorkers(state) {
    var n = 0;
    WORKER_KEYS.forEach(function (k) {
      if (k === "gatherer") return;
      n += state.workers[k] || 0;
    });
    return n;
  }

  function syncGatherers(state) {
    var extra = assignedWorkers(state) - (state.population || 0);
    if (extra > 0) {
      Object.keys(JOB_BUILDING).forEach(function (job) {
        if (extra <= 0) return;
        var n = state.workers[job] || 0;
        if (n <= 0) return;
        var cut = Math.min(n, extra);
        state.workers[job] = n - cut;
        extra -= cut;
      });
    }
    state.workers.gatherer = Math.max(0, (state.population || 0) - assignedWorkers(state));
    return state.workers.gatherer;
  }

  function unlockWorkersForBuildings(state) {
    Object.keys(JOB_BUILDING).forEach(function (job) {
      var b = JOB_BUILDING[job];
      if ((state.buildings[b] || 0) > 0) {
        if (typeof state.workers[job] !== "number") state.workers[job] = 0;
      }
    });
  }

  function workerUnlocked(state, job) {
    if (job === "gatherer") return (state.population || 0) > 0;
    var b = JOB_BUILDING[job];
    return !!(b && (state.buildings[b] || 0) > 0);
  }

  function visibleJobs(state) {
    var out = [];
    if ((state.population || 0) > 0) out.push("gatherer");
    Object.keys(JOB_BUILDING).forEach(function (job) {
      if (workerUnlocked(state, job)) out.push(job);
    });
    return out;
  }

  function costSeen(state, cost) {
    if (!cost) return false;
    if ((state.stores.wood || 0) < (cost.wood || 0) * 0.5) return false;
    for (var k in cost) {
      if (k === "wood") continue;
      if (!(state.stores[k] > 0)) return false;
    }
    return true;
  }

  function craftVisible(state, kind) {
    if (CRAFTABLE[kind]) {
      if ((state.buildings.workshop || 0) <= 0) return false;
      if (state.flags["craft_unlocked_" + kind]) return true;
      return costSeen(state, CRAFTABLE[kind].cost);
    }
    if (state.flags["craft_unlocked_" + kind] || (state.buildings[kind] || 0) > 0) return true;
    return costSeen(state, buildingCost(kind, state.buildings[kind] || 0));
  }

  function checkCraftUnlocks(state) {
    if (state.builder_level < 4) return;
    BUILDABLE.forEach(function (kind) {
      if (state.flags["craft_unlocked_" + kind] || state.flags["craft_hint_" + kind]) return;
      if (!craftVisible(state, kind)) return;
      state.flags["craft_unlocked_" + kind] = true;
      var msg = BUILD_AVAILABLE[kind];
      if (msg) pushNote(state, t(msg), "room");
    });
    if ((state.buildings.workshop || 0) <= 0) return;
    CRAFT_KEYS.forEach(function (kind) {
      if (state.flags["craft_unlocked_" + kind] || state.flags["craft_hint_" + kind]) return;
      if (!craftVisible(state, kind)) return;
      state.flags["craft_unlocked_" + kind] = true;
    });
  }

  function applyWorkerIncome(state, dt, analytics) {
    var produced = {};
    Object.keys(INCOME).forEach(function (job) {
      var spec = INCOME[job];
      var n = job === "gatherer" ? (state.workers.gatherer || 0) : (state.workers[job] || 0);
      if (n <= 0) return;
      if (typeof state.income_acc[job] !== "number") state.income_acc[job] = 0;
      state.income_acc[job] += dt;
      if (state.income_acc[job] < spec.delay) return;
      var ticks = Math.floor(state.income_acc[job] / spec.delay);
      state.income_acc[job] -= ticks * spec.delay;
      var t0;
      for (t0 = 0; t0 < ticks; t0++) {
        var okApply = true;
        var k;
        for (k in spec.stores) {
          if ((state.stores[k] || 0) + spec.stores[k] * n < 0) {
            okApply = false;
            break;
          }
        }
        if (!okApply) continue;
        for (k in spec.stores) {
          addItem(state, k, spec.stores[k] * n);
          produced[k] = (produced[k] || 0) + spec.stores[k] * n;
        }
        if (analytics && spec.stores.cured_meat > 0 && !state.flags.cured_meat_produced && (state.stores.cured_meat || 0) > 0) {
          state.flags.cured_meat_produced = true;
          analytics.log(state, "cured_meat_first", {
            workers: n,
            source: job,
            cured_meat: state.stores.cured_meat,
            stores: deepClone(state.stores)
          });
        }
      }
    });
    return produced;
  }

  function bagHave(state, item) {
    var n = state.stores[item] || 0;
    if (state.world && state.world.on_expedition) n += state.outfit[item] || 0;
    return n;
  }

  function canAfford(state, cost) {
    for (var k in cost) {
      if (bagHave(state, k) < cost[k]) return false;
    }
    return true;
  }

  function pay(state, cost) {
    for (var k in cost) {
      var need = cost[k];
      if (state.world && state.world.on_expedition && (state.outfit[k] || 0) > 0) {
        var fromBag = Math.min(need, state.outfit[k] || 0);
        state.outfit[k] = (state.outfit[k] || 0) - fromBag;
        need -= fromBag;
      }
      if (need) addItem(state, k, -need);
    }
  }

  function grant(state, reward) {
    if (!reward) return;
    for (var k in reward) {
      if (state.world && state.world.on_expedition && ITEMS.indexOf(k) >= 0) {
        state.outfit[k] = (state.outfit[k] || 0) + reward[k];
        if (reward[k] > 0) {
          if (!state.seen) state.seen = {};
          state.seen[k] = true;
        }
      } else {
        addItem(state, k, reward[k]);
      }
    }
  }

  function eventAvailable(state, spec) {
    var w = spec && spec.when;
    if (!w) return false;
    // World encounters live in Events.Encounters and are rolled on world_move.
    // The village scheduler must not pick them (original EventPool is room/outside only).
    if (spec.combat || w.terrain || w.min_dist != null || w.max_dist != null) return false;
    if (w.location) {
      var locs = Array.isArray(w.location) ? w.location : [w.location];
      if (locs.indexOf(state.location) < 0) return false;
    }
    if (w.store && !(state.stores[w.store] > 0)) return false;
    if (w.wood_inited && !state.wood_initialized) return false;
    if (w.min_huts != null && (state.buildings.hut || 0) < w.min_huts) return false;
    if (w.max_huts != null && (state.buildings.hut || 0) > w.max_huts) return false;
    if (w.min_traps != null && (state.buildings.trap || 0) < w.min_traps) return false;
    if (w.world && !state.unlocked.world) return false;
    if (w.medicine && !(state.stores.medicine > 0)) return false;
    if (w.pop_gt != null && !(state.population > w.pop_gt)) return false;
    if (w.pop_lt != null && !(state.population < w.pop_lt)) return false;
    if (w.thieves != null && state.flags.thieves !== w.thieves) return false;
    if (w.city_cleared && !state.flags.city_cleared) return false;
    if (w.penrose_off && state.flags.marketing_penrose) return false;
    return true;
  }

  function buttonAvailable(state, btn) {
    if (!btn) return false;
    if (btn.require_no && (state.stores[btn.require_no] || 0) > 0) return false;
    if (btn.require_flag_off && state.flags[btn.require_flag_off]) return false;
    return true;
  }

  function killVillagers(state, num) {
    var n = Math.max(0, Math.floor(Number(num) || 0));
    if (n <= 0) return;
    state.population = Math.max(0, (state.population || 0) - n);
    syncGatherers(state);
  }

  function destroyHuts(state, num) {
    var left = Math.max(0, Math.floor(Number(num) || 0));
    while (left > 0 && (state.buildings.hut || 0) > 0) {
      var pop = state.population || 0;
      var rate = pop / 4;
      var full = Math.floor(rate);
      var huts = Math.ceil(rate);
      if (!huts) break;
      var target = Math.floor(Math.random() * huts) + 1;
      var inhabitants = 0;
      if (target <= full) inhabitants = 4;
      else if (target === full + 1) inhabitants = pop % 4;
      state.buildings.hut -= 1;
      if (inhabitants) killVillagers(state, inhabitants);
      left -= 1;
    }
  }

  function currentScene(active) {
    if (!active || !active.spec) return null;
    var spec = active.spec;
    var name = active.scene || "start";
    if (spec.scenes && spec.scenes[name]) return spec.scenes[name];
    if (name === "start") return spec;
    return spec;
  }

  function worldKey(state) {
    return state.world.x + "," + state.world.y;
  }

  function applySceneEffects(state, scene) {
    if (!scene) return;
    if (scene.reward) grant(state, scene.reward);
    if (scene.loot && !scene.combat) grant(state, rollLoot(scene.loot));
    if (scene.notification) pushNote(state, scene.notification, state.location);
    if (scene.set_flag) state.flags[scene.set_flag] = true;
    if (scene.water && state.world && state.world.on_expedition) {
      state.world.water = Math.min(getMaxWater(state), state.world.water + scene.water);
    }
    var fx = scene.onload;
    if (!fx) return;
    if (fx.destroy_huts) destroyHuts(state, fx.destroy_huts);
    if (fx.kill_pop) {
      var lo = fx.kill_pop.min || 1;
      var hi = fx.kill_pop.max;
      if (fx.kill_pop.max_frac != null) hi = Math.floor((state.population || 0) * fx.kill_pop.max_frac);
      if (hi == null || hi < lo) hi = lo;
      killVillagers(state, Math.floor(Math.random() * (hi - lo + 1)) + lo);
    }
    if (fx.add_hut && (state.buildings.hut || 0) < 20) state.buildings.hut += 1;
    if (fx.give) grant(state, fx.give);
    if (fx.set_thieves != null) state.flags.thieves = fx.set_thieves;
    if (fx.return_stolen) {
      grant(state, state.flags.stolen || {});
      state.flags.stolen = {};
    }
    if (fx.learn) addPerk(state, fx.learn);
    if (fx.mark_visited && state.world) {
      state.world.cleared[worldKey(state)] = true;
      state.world.visited[worldKey(state)] = true;
    }
    if (fx.visited_old_house) state.flags.visited_old_house = true;
    if (fx.set_water && state.world && state.world.on_expedition) {
      state.world.water = getMaxWater(state);
      pushNote(state, t("water replenished"), "world");
    }
    if (fx.use_outpost && state.world) {
      state.world.water = getMaxWater(state);
      if (!state.world.outposts_used) state.world.outposts_used = {};
      state.world.outposts_used[worldKey(state)] = true;
      state.world.visited[worldKey(state)] = true;
      pushNote(state, t("water replenished"), "world");
    }
    if (fx.city_cleared) state.flags.city_cleared = true;
    if (fx.world_flag) {
      state.flags["world_" + fx.world_flag] = true;
      if (state.world) state.world[fx.world_flag] = true;
    }
    if (fx.collect_stores && state.previous && state.previous.stores) {
      grant(state, state.previous.stores);
    }
    if (fx.delay_give && Math.random() < (fx.delay_give.chance == null ? 1 : fx.delay_give.chance)) {
      var after = fx.delay_give.after || 60;
      var stores = fx.delay_give.stores || {};
      Object.keys(stores).forEach(function (item) {
        state.scheduled.push({
          at: state.game_time_sec + after,
          call: { tool: "give_item", args: { item: item, amount: stores[item] } },
          origin: "event"
        });
      });
      if (fx.delay_give.note) {
        state.scheduled.push({
          at: state.game_time_sec + after,
          call: { tool: "narrate", args: { text: fx.delay_give.note, source: "room" } },
          origin: "event"
        });
      }
    }
  }

  function maybeStartThieves(state) {
    if (state.flags.thieves != null) return;
    if (!state.unlocked || !state.unlocked.world) return;
    var k;
    for (k in state.stores) {
      if ((state.stores[k] || 0) > 5000) {
        state.flags.thieves = 1;
        if (!state.flags.stolen || typeof state.flags.stolen !== "object") state.flags.stolen = {};
        state.income_acc.thieves = 0;
        return;
      }
    }
  }

  function applyThiefIncome(state, dt) {
    if (state.flags.thieves !== 1) return;
    if (typeof state.income_acc.thieves !== "number") state.income_acc.thieves = 0;
    if (!state.flags.stolen || typeof state.flags.stolen !== "object") state.flags.stolen = {};
    state.income_acc.thieves += dt;
    var take = { wood: 10, fur: 5, meat: 5 };
    while (state.income_acc.thieves >= 10) {
      state.income_acc.thieves -= 10;
      Object.keys(take).forEach(function (k) {
        var have = state.stores[k] || 0;
        var n = Math.min(have, take[k]);
        if (n > 0) {
          addItem(state, k, -n);
          state.flags.stolen[k] = (state.flags.stolen[k] || 0) + n;
        }
      });
    }
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
    ["stoke", "gather", "traps", "liftoff"].forEach(function (id) {
      remaining[id] = Math.round(cooldownLeft(state, id, timeScale) * 10) / 10;
      ends[id] = (state.cooldown_ends_at && state.cooldown_ends_at[id]) || 0;
    });
    return { remaining: remaining, ends_at: ends, wall_now: nowMs() };
  }

  function clearCooldown(state, id) {
    if (state.cooldowns) delete state.cooldowns[id];
    if (state.cooldown_ends_at) delete state.cooldown_ends_at[id];
  }

  function ensureSpaceShip(state) {
    if (!isPlainObject(state.spaceShip)) {
      state.spaceShip = { hull: BASE_HULL, thrusters: BASE_THRUSTERS, seenShip: false, seenWarning: false };
    }
    if (typeof state.spaceShip.hull !== "number" || !isFinite(state.spaceShip.hull)) state.spaceShip.hull = BASE_HULL;
    if (typeof state.spaceShip.thrusters !== "number" || !isFinite(state.spaceShip.thrusters)) state.spaceShip.thrusters = BASE_THRUSTERS;
    if (typeof state.spaceShip.seenShip !== "boolean") state.spaceShip.seenShip = !!state.spaceShip.seenShip;
    if (typeof state.spaceShip.seenWarning !== "boolean") state.spaceShip.seenWarning = !!state.spaceShip.seenWarning;
    if (!isPlainObject(state.unlocked)) state.unlocked = {};
    if (typeof state.unlocked.ship !== "boolean") state.unlocked.ship = !!state.unlocked.ship;
    if (typeof state.unlocked.space !== "boolean") state.unlocked.space = !!state.unlocked.space;
    return state.spaceShip;
  }

  function shipSpeed(state) {
    var ship = ensureSpaceShip(state);
    return SHIP_SPEED + (ship.thrusters || 0);
  }

  function spaceLayerTitle(altitude) {
    if (altitude < 10) return t("Troposphere");
    if (altitude < 20) return t("Stratosphere");
    if (altitude < 30) return t("Mesosphere");
    if (altitude < 45) return t("Thermosphere");
    if (altitude < 60) return t("Exosphere");
    return t("Space");
  }

  function maybeSeeShip(state) {
    var ship = ensureSpaceShip(state);
    if (!ship.seenShip) {
      pushNote(state, t("somewhere above the debris cloud, the wanderer fleet hovers. been on this rock too long."), "ship");
      ship.seenShip = true;
    }
  }

  function maybeSeeFabricator(state) {
    if (!state.flags.fabricator_seen) {
      pushNote(state, t("the familiar hum of wanderer machinery coming to life. finally, real tools."), "fabricator");
      state.flags.fabricator_seen = true;
    }
  }

  function asteroidCountAt(altitude) {
    var n = 1;
    if (altitude > 10) n += 1;
    if (altitude > 20) n += 2;
    if (altitude > 40) n += 2;
    return n;
  }

  function spawnAsteroid(space) {
    var glyph = ASTEROID_GLYPHS[Math.floor(Math.random() * ASTEROID_GLYPHS.length)];
    var dur = BASE_ASTEROID_SPEED - Math.floor(Math.random() * (BASE_ASTEROID_SPEED * 0.65));
    if (dur < 200) dur = 200;
    space.asteroids.push({
      x: Math.floor(Math.random() * SPACE_WIDTH),
      y: 0,
      w: 14,
      h: 16,
      glyph: glyph,
      vy: SPACE_HEIGHT / (dur / 1000)
    });
  }

  function startSpace(state) {
    var ship = ensureSpaceShip(state);
    state.space = {
      active: true,
      done: false,
      altitude: 0,
      hull: ship.hull,
      maxHull: ship.hull,
      shipX: SPACE_WIDTH / 2,
      shipY: SPACE_HEIGHT / 2,
      up: false,
      down: false,
      left: false,
      right: false,
      asteroids: [],
      spawnAcc: 0,
      startedAt: state.game_time_sec,
      altAcc: 0
    };
    state.location = "space";
    spawnAsteroid(state.space);
  }

  function crashSpace(state) {
    if (!state.space || state.space.done) return;
    state.space.done = true;
    state.space.active = false;
    state.space.asteroids = [];
    state.location = "ship";
    setCooldown(state, "liftoff", LIFTOFF_COOLDOWN, 1);
    pushNote(state, t("the world fades"), "ship");
  }

  function finishAscent(state) {
    if (!state.space || state.space.done) return;
    state.space.done = true;
    state.space.active = false;
    state.space.asteroids = [];
    state.flags.space_escaped = true;
    pushNote(state, t("Space"), "space");
  }

  function tickSpace(state, dt) {
    var sp = state.space;
    if (!sp || !sp.active || sp.done) return;
    var speed = shipSpeed(state);
    var dx = 0;
    var dy = 0;
    if (sp.up) dy -= speed;
    else if (sp.down) dy += speed;
    if (sp.left) dx -= speed;
    else if (sp.right) dx += speed;
    if (dx !== 0 && dy !== 0) {
      dx = dx / Math.sqrt(2);
      dy = dy / Math.sqrt(2);
    }
    var frames = dt / (33 / 1000);
    sp.shipX += dx * frames;
    sp.shipY += dy * frames;
    if (sp.shipX < 10) sp.shipX = 10;
    else if (sp.shipX > SPACE_WIDTH - 10) sp.shipX = SPACE_WIDTH - 10;
    if (sp.shipY < 10) sp.shipY = 10;
    else if (sp.shipY > SPACE_HEIGHT - 10) sp.shipY = SPACE_HEIGHT - 10;

    sp.altAcc += dt;
    while (sp.altAcc >= 1) {
      sp.altAcc -= 1;
      sp.altitude += 1;
      if (sp.altitude > 60) sp.altAcc = 0;
    }

    var spawnEvery = Math.max(0.1, (1000 - sp.altitude * 10) / 1000);
    void BASE_ASTEROID_DELAY;
    sp.spawnAcc += dt;
    while (sp.spawnAcc >= spawnEvery && !sp.done) {
      sp.spawnAcc -= spawnEvery;
      var extra = asteroidCountAt(sp.altitude);
      for (var i = 0; i < extra; i++) spawnAsteroid(sp);
    }

    var next = [];
    for (var a = 0; a < sp.asteroids.length; a++) {
      var rock = sp.asteroids[a];
      rock.y += rock.vy * dt;
      if (rock.x - rock.w / 2 <= sp.shipX && rock.x + rock.w / 2 >= sp.shipX
          && rock.y <= sp.shipY && rock.y + rock.h >= sp.shipY) {
        sp.hull -= 1;
        if (sp.hull <= 0) {
          crashSpace(state);
          return;
        }
        continue;
      }
      if (rock.y < SPACE_HEIGHT + 20) next.push(rock);
    }
    sp.asteroids = next;

    if (state.game_time_sec - sp.startedAt >= FTB_SPEED / 1000) {
      finishAscent(state);
    }
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
    var cx = Math.floor((size || WORLD_SIZE) / 2);
    var dx = x - cx;
    var dy = y - cx;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1.2) return "village";
    var h = Math.abs(Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453) % 1;
    var roll = h * (1 - STICKINESS) + ((x + y) % 3) / 3 * STICKINESS;
    if (d < 10) return roll < 0.55 ? "forest" : (roll < 0.85 ? "grass" : "dust");
    if (d < 20) return roll < 0.25 ? "forest" : (roll < 0.70 ? "grass" : "dust");
    return roll < 0.15 ? "forest" : (roll < 0.50 ? "grass" : "dust");
  }

  function worldDistance(state) {
    return Math.abs(state.world.x - VILLAGE_X) + Math.abs(state.world.y - VILLAGE_Y);
  }

  function terrainKind(state) {
    var ter = terrainAt(state.world.x, state.world.y, state.world.size);
    if (ter === "grass") return "field";
    if (ter === "dust") return "barrens";
    return ter;
  }

  function hasPerk(state, id) {
    return !!(state.perks && state.perks[id]);
  }

  function addPerk(state, id) {
    if (!PERKS[id]) return;
    if (!state.perks) state.perks = emptyPerks();
    if (state.perks[id]) return;
    state.perks[id] = true;
    state.flags["learned_" + id] = true;
    if (PERKS[id].notify) pushNote(state, t(PERKS[id].notify), state.location);
  }

  function meatHeal(state) {
    return MEAT_HEAL * (hasPerk(state, "gastronome") ? 2 : 1);
  }

  function getHitChance(state) {
    return BASE_HIT_CHANCE + (hasPerk(state, "precise") ? 0.1 : 0);
  }

  function lightRadius(state) {
    return LIGHT_RADIUS * (hasPerk(state, "scout") ? 2 : 1);
  }

  function movesPerFood(state) {
    return MOVES_PER_FOOD * (hasPerk(state, "slow_metabolism") ? 2 : 1);
  }

  function movesPerWater(state) {
    return MOVES_PER_WATER * (hasPerk(state, "desert_rat") ? 2 : 1);
  }

  function fightChance(state) {
    return FIGHT_CHANCE * (hasPerk(state, "stealthy") ? 0.5 : 1);
  }

  function rollLoot(loot) {
    var out = {};
    if (!loot) return out;
    Object.keys(loot).forEach(function (k) {
      var spec = loot[k];
      if (!spec || Math.random() > (spec.chance == null ? 1 : spec.chance)) return;
      var lo = spec.min || 1;
      var hi = spec.max == null ? lo : spec.max;
      out[k] = Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
    return out;
  }

  function pickWorldEncounter(state, catalog) {
    var d = worldDistance(state);
    var ter = terrainKind(state);
    var pool = [];
    Object.keys(catalog || {}).forEach(function (id) {
      var spec = catalog[id];
      if (!spec || !spec.combat || !spec.when) return;
      var w = spec.when;
      if (w.terrain && w.terrain !== ter) return;
      if (w.max_dist != null && d > w.max_dist) return;
      if (w.min_dist != null && d <= w.min_dist) return;
      pool.push(id);
    });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function beginCombat(state, spec, catalog) {
    var ev = spec || {};
    var c = ev.combat || {};
    state.combat = {
      id: ev.id || (state.active_event && state.active_event.id) || "fight",
      hp: c.hp || 4,
      dmg: c.dmg || 1,
      hit: c.hit == null ? BASE_HIT_CHANCE : c.hit,
      name: c.name || ev.title || "敌人",
      death: c.death || "",
      reward: c.reward || null,
      loot: c.loot || null,
      stunned: false
    };
  }

  function RuleDirector() {
    this.seen = {};
  }

  RuleDirector.prototype.think = function (state, catalog) {
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
      Object.keys(catalog || {}).forEach(function (id) {
        var spec = catalog[id];
        if (spec && spec.when && spec.when.location && eventAvailable(state, spec)) pool.push(id);
      });
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
        workers: deepClone(state.workers),
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
        workers: deepClone(state.workers),
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
    this.state = migrateState(createState());
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
  }

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
    var calls = this.rule.think(this.state, this.events);
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
    if (s.active_event && action !== "event_choice" && action !== "combat" && action !== "export_telemetry" && action !== "set_director" && action !== "set_timescale" && action !== "travel" && action !== "assign_worker") {
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
        var craftSpec = CRAFTABLE[kind];
        if (craftSpec) {
          if (needsWorkshop(craftSpec.type) && (s.buildings.workshop || 0) <= 0) {
            return { ok: false, error: "no_workshop" };
          }
          var haveCraft = s.stores[kind] || 0;
          var craftCap = craftSpec.max || 0;
          if (craftCap > 0 && haveCraft >= craftCap) return { ok: false, error: "max" };
          var craftPay = craftCost(kind);
          if (!craftPay || !canAfford(s, craftPay)) return { ok: false, error: "cost" };
          pay(s, craftPay);
          addItem(s, kind, 1);
          s.flags["craft_unlocked_" + kind] = true;
          if (craftSpec.buildMsg) pushNote(s, t(craftSpec.buildMsg), "room");
          this.analytics.log(s, "build", {
            kind: kind,
            type: craftSpec.type,
            cost: craftPay,
            have: s.stores[kind],
            stores: deepClone(s.stores)
          });
          break;
        }
        var max = buildingMax(kind);
        if (!max) return { ok: false, error: "unknown_building" };
        if ((s.buildings[kind] || 0) >= max) return { ok: false, error: "max" };
        var cost = buildingCost(kind, s.buildings[kind] || 0);
        if (!cost || !canAfford(s, cost)) return { ok: false, error: "cost" };
        pay(s, cost);
        s.buildings[kind] = (s.buildings[kind] || 0) + 1;
        s.flags["craft_unlocked_" + kind] = true;
        if (kind === "trap") pushNote(s, t("more traps to catch more creatures"), "room");
        if (kind === "cart") pushNote(s, t("the rickety cart will carry more wood from the forest"), "room");
        if (kind === "hut") {
          pushNote(s, t("builder puts up a hut, out in the forest. says word will get around."), "room");
          // @pacing kind=interval id=pop_timer_min value=30s phase=village
          // @pacing kind=interval id=pop_timer_span value=150s phase=village
          if (s.pop_timer == null) s.pop_timer = s.game_time_sec + 30 + Math.random() * 150;
        }
        if (BUILD_DONE[kind]) pushNote(s, t(BUILD_DONE[kind]), "room");
        unlockWorkersForBuildings(s);
        syncGatherers(s);
        this.analytics.log(s, "build", {
          kind: kind,
          cost: cost,
          have: s.buildings[kind],
          buildings: deepClone(s.buildings),
          path: Object.keys(s.buildings).filter(function (k) { return s.buildings[k] > 0; })
        });
        break;
      case "buy":
        if ((s.buildings.trading_post || 0) <= 0) return { ok: false, error: "no_post" };
        var buyKind = args.kind;
        var buySpec = TRADEABLE[buyKind];
        if (!buySpec) return { ok: false, error: "unknown_good" };
        if (!buyVisible(s, buyKind)) return { ok: false, error: "locked" };
        var haveBuy = s.stores[buyKind] || 0;
        var buyCap = buySpec.max || 0;
        if (buyCap > 0 && haveBuy >= buyCap) return { ok: false, error: "max" };
        var buyPay = tradeCost(buyKind);
        if (!buyPay || !canAfford(s, buyPay)) return { ok: false, error: "cost" };
        pay(s, buyPay);
        addItem(s, buyKind, 1);
        s.flags["buy_unlocked_" + buyKind] = true;
        this.analytics.log(s, "buy", {
          kind: buyKind,
          type: buySpec.type,
          cost: buyPay,
          have: s.stores[buyKind],
          stores: deepClone(s.stores)
        });
        break;
      case "travel":
        if (s.location === "space" && s.space && s.space.active) return { ok: false, error: "in_space" };
        if (args.area === "space") return { ok: false, error: "locked" };
        if (!s.unlocked[args.area] && args.area !== "room") return { ok: false, error: "locked" };
        if (s.world.on_expedition) return { ok: false, error: "away" };
        s.location = args.area;
        if (args.area === "ship") maybeSeeShip(s);
        if (args.area === "fabricator") maybeSeeFabricator(s);
        break;
      case "assign_worker":
        var job = args.job;
        var delta = args.delta | 0;
        if (!job || !INCOME[job] || job === "gatherer") return { ok: false, error: "job" };
        if (!workerUnlocked(s, job)) return { ok: false, error: "locked" };
        syncGatherers(s);
        if (delta > 0) {
          var free = s.workers.gatherer || 0;
          var take = Math.min(delta, free);
          if (take <= 0) return { ok: false, error: "no_gatherers" };
          s.workers[job] = (s.workers[job] || 0) + take;
        } else if (delta < 0) {
          var haveJob = s.workers[job] || 0;
          var give = Math.min(-delta, haveJob);
          if (give <= 0) return { ok: false, error: "none" };
          s.workers[job] = haveJob - give;
        } else {
          return { ok: false, error: "delta" };
        }
        syncGatherers(s);
        this.analytics.log(s, "worker_assign", {
          job: job,
          delta: delta,
          workers: deepClone(s.workers),
          population: s.population,
          buildings: deepClone(s.buildings)
        });
        break;
      case "pack":
        var item = args.item;
        var n = args.amount | 0;
        if (ITEMS.indexOf(item) < 0) return { ok: false, error: "item" };
        if (n > 0) {
          var have = s.stores[item] || 0;
          var w = itemWeight(item);
          var free = bagCapacity(s) - bagUsed(s);
          var bySpace = w > 0 ? Math.floor(free / w + 1e-9) : have;
          var take = Math.min(n, have, bySpace);
          if (take <= 0) return { ok: false, error: "space" };
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
        if (s.flags.world_death_until != null && s.game_time_sec < s.flags.world_death_until) {
          return { ok: false, error: "death_cooldown" };
        }
        s.world.on_expedition = true;
        s.world.x = VILLAGE_X;
        s.world.y = VILLAGE_Y;
        s.world.water = getMaxWater(s);
        s.world.hp = getMaxHealth(s);
        s.world.max_hp = getMaxHealth(s);
        s.world.food_moves = 0;
        s.world.water_moves = 0;
        s.world.fight_moves = 0;
        s.location = "world";
        s.world.visited[VILLAGE_X + "," + VILLAGE_Y] = true;
        pushNote(s, t("A Barren World"), "world");
        break;
      case "world_move":
        if (!s.world.on_expedition) return { ok: false, error: "home" };
        var nx = s.world.x + (args.dx || 0);
        var ny = s.world.y + (args.dy || 0);
        if (nx < 0 || ny < 0 || nx >= s.world.size || ny >= s.world.size) return { ok: false, error: "edge" };
        s.world.x = nx;
        s.world.y = ny;
        s.world.visited[nx + "," + ny] = true;
        s.world.water_moves += 1;
        if (s.world.water_moves >= movesPerWater(s)) {
          s.world.water_moves = 0;
          s.world.water -= 1;
        }
        s.world.food_moves += 1;
        // @pacing kind=consume id=world_food_moves value=2 phase=world
        if (s.world.food_moves >= movesPerFood(s)) {
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
        if (nx === VILLAGE_X && ny === VILLAGE_Y) {
          this._goHome(true);
          break;
        }
        var d = worldDistance(s);
        if (d >= 8 && !s.world.seen_danger && (s.stores.i_armour || 0) <= 0 && (s.stores.s_armour || 0) <= 0) {
          s.world.seen_danger = true;
          pushNote(s, t("dangerous to be this far from the village without proper protection"), "world");
        }
        var lm = s.world.landmarks[nx + "," + ny];
        var lmKey = nx + "," + ny;
        var usedOutpost = lm === "outpost" && s.world.outposts_used && s.world.outposts_used[lmKey];
        var alreadyCleared = lm && lm !== "outpost" && s.world.cleared && s.world.cleared[lmKey];
        if (lm && !s.active_event && !usedOutpost && !alreadyCleared) {
          executeTool(s, { tool: "spawn_event", args: { event_id: lm } }, { events: this.events });
        } else if (d > 0 && !s.active_event && !s.combat) {
          s.world.fight_moves = (s.world.fight_moves || 0) + 1;
          if (s.world.fight_moves > FIGHT_DELAY && Math.random() < fightChance(s)) {
            s.world.fight_moves = 0;
            var fightId = pickWorldEncounter(s, this.events) || "snarling_beast";
            executeTool(s, { tool: "spawn_event", args: { event_id: fightId } }, { events: this.events });
            var ev = this.events[fightId];
            if (ev && ev.combat) beginCombat(s, ev);
          }
        }
        if (s.world.hp <= 0) {
          this.analytics.log(s, "death", { where: "world" });
          pushNote(s, t("the world fades"), "world");
          s.flags.world_death_until = s.game_time_sec + DEATH_COOLDOWN;
          this._goHome(false);
        }
        break;
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
        var nextScale = Math.max(0.25, Math.min(20, args.scale || 1));
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
        this.state = migrateState(createState());
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
      case "reinforce_hull":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        ensureSpaceShip(s);
        if ((s.stores.alien_alloy || 0) < ALLOY_PER_HULL) {
          pushNote(s, t("not enough alien alloy"), "ship");
          return { ok: false, error: "cost" };
        }
        addItem(s, "alien_alloy", -ALLOY_PER_HULL);
        s.spaceShip.hull += 1;
        break;
      case "upgrade_engine":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        ensureSpaceShip(s);
        if ((s.stores.alien_alloy || 0) < ALLOY_PER_THRUSTER) {
          pushNote(s, t("not enough alien alloy"), "ship");
          return { ok: false, error: "cost" };
        }
        addItem(s, "alien_alloy", -ALLOY_PER_THRUSTER);
        s.spaceShip.thrusters += 1;
        break;
      case "lift_off":
        if (!s.unlocked.ship) return { ok: false, error: "locked" };
        if (s.location === "space") return { ok: false, error: "in_space" };
        ensureSpaceShip(s);
        if (s.spaceShip.hull <= 0) return { ok: false, error: "no_hull" };
        if (!cooldownReady(s, "liftoff")) return { ok: false, error: "cooldown" };
        setCooldown(s, "liftoff", LIFTOFF_COOLDOWN, this.timeScale);
        if (!s.spaceShip.seenWarning) {
          var warn = executeTool(s, { tool: "spawn_event", args: { event_id: "liftoff_warning" } }, { events: this.events });
          if (!warn || !warn.ok) {
            s.spaceShip.seenWarning = true;
            startSpace(s);
          }
        } else {
          startSpace(s);
        }
        break;
      case "fabricate":
        if (!s.unlocked.fabricator) return { ok: false, error: "locked" };
        var fabKind = args.kind;
        var fabSpec = FABRICABLE[fabKind];
        if (!fabSpec) return { ok: false, error: "unknown" };
        if (!canFabricate(s, fabKind)) return { ok: false, error: "blueprint" };
        var haveFab = s.stores[fabKind] || 0;
        var fabCap = fabSpec.max || 0;
        if (fabCap > 0 && haveFab >= fabCap) return { ok: false, error: "max" };
        var fabPay = fabricateCost(fabKind);
        if (!fabPay || !canAfford(s, fabPay)) {
          pushNote(s, t("not enough alien alloy"), "fabricator");
          return { ok: false, error: "cost" };
        }
        pay(s, fabPay);
        addItem(s, fabKind, fabSpec.quantity || 1);
        if (fabSpec.buildMsg) pushNote(s, t(fabSpec.buildMsg), "fabricator");
        break;
      case "space_steer":
        if (s.location !== "space" || !s.space || !s.space.active) return { ok: false, error: "grounded" };
        var dir = args.dir;
        var held = args.down !== false;
        if (dir === "up" || dir === "down" || dir === "left" || dir === "right") {
          s.space[dir] = held;
        }
        if (args.dx || args.dy) {
          s.space.shipX += (args.dx || 0) * shipSpeed(s);
          s.space.shipY += (args.dy || 0) * shipSpeed(s);
          if (s.space.shipX < 10) s.space.shipX = 10;
          if (s.space.shipX > SPACE_WIDTH - 10) s.space.shipX = SPACE_WIDTH - 10;
          if (s.space.shipY < 10) s.space.shipY = 10;
          if (s.space.shipY > SPACE_HEIGHT - 10) s.space.shipY = SPACE_HEIGHT - 10;
        }
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
    this.emit();
    if (action !== "quit") this.persistSave();
    return { ok: true };
  };

  Game.prototype._goHome = function (success) {
    var s = this.state;
    redeemBlueprints(s);
    for (var k in s.outfit) {
      if (s.outfit[k] > 0) addItem(s, k, s.outfit[k]);
      s.outfit[k] = 0;
    }
    if (s.flags.world_ironmine && !s.buildings.iron_mine) s.buildings.iron_mine = 1;
    if (s.flags.world_coalmine && !s.buildings.coal_mine) s.buildings.coal_mine = 1;
    if (s.flags.world_sulphurmine && !s.buildings.sulphur_mine) s.buildings.sulphur_mine = 1;
    if (s.flags.world_ship) {
      ensureSpaceShip(s);
      s.unlocked.ship = true;
      s.unlocked.space = true;
    }
    if (s.flags.world_executioner && !s.unlocked.fabricator) {
      s.unlocked.fabricator = true;
      pushNote(s, t("builder knows the strange device when she sees it. takes it for herself real quick. doesn’t ask where it came from."), "path");
    }
    if (s.flags.visited_old_house && success && !s.slice_complete) {
      s.slice_complete = true;
      pushNote(s, "你带回了旧房子里的见闻。尘途的第一段走完了。", "path");
      this.analytics.log(s, "slice_complete", { game_time_sec: s.game_time_sec });
    }
    if (success) pushNote(s, t("water replenished"), "path");
    s.world.on_expedition = false;
    s.location = "path";
    s.active_event = null;
    s.combat = null;
  };

  Game.prototype._enterEventScene = function (name) {
    var s = this.state;
    if (!s.active_event || !s.active_event.spec) return;
    var spec = s.active_event.spec;
    if (!spec.scenes || !spec.scenes[name]) return;
    s.active_event.scene = name;
    applySceneEffects(s, spec.scenes[name]);
    if (spec.scenes[name].combat) beginCombat(s, spec.scenes[name]);
  };

  Game.prototype._resolveEvent = function (buttonId) {
    var s = this.state;
    if (!s.active_event) return;
    var spec = s.active_event.spec;
    var scene = currentScene(s.active_event);
    var btn = (scene.buttons || spec.buttons || []).filter(function (b) { return b.id === buttonId; })[0];
    if (!btn) return;
    if (!buttonAvailable(s, btn)) return;
    if (btn.cost && !canAfford(s, btn.cost)) return;
    if (btn.cost) pay(s, btn.cost);
    if (btn.reward) grant(s, btn.reward);
    if (btn.note) pushNote(s, btn.note, s.location);
    if (btn.lose_pop) {
      s.population = Math.max(0, s.population - btn.lose_pop);
      syncGatherers(s);
    }
    if (btn.learn) addPerk(s, btn.learn);
    if (btn.map_piece) s.flags.map_pieces = (s.flags.map_pieces || 0) + 1;
    if (btn.set_flag) s.flags[btn.set_flag] = true;
    if (btn.random_next) {
      var r = Math.random();
      var acc = 0;
      var pick = null;
      Object.keys(btn.random_next).forEach(function (k) {
        acc += btn.random_next[k];
        if (pick == null && r <= acc) pick = k;
      });
      if (pick && spec.scenes && spec.scenes[pick]) {
        this._enterEventScene(pick);
        return;
      }
    }
    if (btn.next && btn.next !== "end" && spec.scenes && spec.scenes[btn.next]) {
      this._enterEventScene(btn.next);
      return;
    }
    var evId = s.active_event.id;
    s.active_event = null;
    if (s.combat) s.combat = null;
    if (evId === "liftoff_warning") {
      if (buttonId === "fly") {
        ensureSpaceShip(s);
        s.spaceShip.seenWarning = true;
        startSpace(s);
      } else if (buttonId === "linger") {
        clearCooldown(s, "liftoff");
      }
    }
  };

  Game.prototype._combat = function (move) {
    var s = this.state;
    if (!s.combat) return;
    if (move === "eat") {
      var food = (s.outfit.cured_meat || 0) > 0 ? "cured_meat" : ((s.outfit.meat || 0) > 0 ? "meat" : null);
      if (!food) return;
      s.outfit[food] -= 1;
      s.world.hp = Math.min(s.world.max_hp, s.world.hp + meatHeal(s));
      return;
    }
    if (move === "meds") {
      if ((s.outfit.medicine || 0) <= 0 && (s.stores.medicine || 0) <= 0) return;
      if ((s.outfit.medicine || 0) > 0) s.outfit.medicine -= 1;
      else addItem(s, "medicine", -1);
      s.world.hp = Math.min(s.world.max_hp, s.world.hp + MEDS_HEAL);
      return;
    }
    if (move === "flee") {
      if (Math.random() < 0.5) {
        s.world.hp -= 1;
        pushNote(s, "逃脱时挨了一下。", "world");
      }
      s.combat = null;
      s.active_event = null;
    } else {
      var weaponId = move === "punch" ? "fists" : move;
      var weapon = WEAPONS[weaponId];
      if (!weapon) return;
      if (weaponId !== "fists") {
        var have = (s.outfit[weaponId] || 0) + (s.stores[weaponId] || 0);
        if (have <= 0 && weaponId !== "fists") return;
      }
      if (weapon.cost) {
        var ck;
        for (ck in weapon.cost) {
          var need = weapon.cost[ck];
          if ((s.outfit[ck] || 0) >= need) s.outfit[ck] -= need;
          else if ((s.stores[ck] || 0) >= need) addItem(s, ck, -need);
          else return;
        }
      }
      if (weaponId === "fists") {
        s.punches = (s.punches || 0) + 1;
        if (s.punches >= 50) addPerk(s, "boxer");
        if (s.punches >= 150) addPerk(s, "martial_artist");
        if (s.punches >= 300) addPerk(s, "unarmed_master");
      }
      if (Math.random() <= getHitChance(s)) {
        var dmg = weapon.damage;
        if (dmg === "stun") {
          s.combat.stunned = true;
        } else if (typeof dmg === "number") {
          if (weapon.type === "unarmed" && hasPerk(s, "boxer")) dmg *= 2;
          if (weapon.type === "unarmed" && hasPerk(s, "martial_artist")) dmg *= 3;
          if (weapon.type === "unarmed" && hasPerk(s, "unarmed_master")) dmg *= 2;
          if (weapon.type === "melee" && hasPerk(s, "barbarian")) dmg = Math.floor(dmg * 1.5);
          s.combat.hp -= dmg;
        }
      }
      if (s.combat.hp > 0) {
        if (s.combat.stunned) {
          s.combat.stunned = false;
        } else {
          var enemyHit = (s.combat.hit == null ? BASE_HIT_CHANCE : s.combat.hit) * (hasPerk(s, "evasive") ? 0.8 : 1);
          if (Math.random() < enemyHit) s.world.hp -= s.combat.dmg;
        }
      }
      if (s.combat.hp <= 0) {
        if (s.combat.reward) grant(s, s.combat.reward);
        grant(s, rollLoot(s.combat.loot));
        pushNote(s, s.combat.death || "倒下了。", "world");
        s.combat = null;
        var won = currentScene(s.active_event);
        if (!(won && won.buttons && won.buttons.length)) s.active_event = null;
      }
    }
    if (s.world.hp <= 0) {
      this.analytics.log(s, "death", { where: "combat" });
      pushNote(s, t("the world fades"), "world");
      s.flags.world_death_until = s.game_time_sec + DEATH_COOLDOWN;
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
    syncGatherers(s);
    // @pacing kind=income id=gatherer_wood value=1/10s phase=village note=per worker
    // @pacing kind=income id=hunter value=0.5fur+0.5meat/10s phase=village
    // @pacing kind=income id=charcutier value=1cured_meat/10s phase=village note=consumes 5 meat + 5 wood
    applyWorkerIncome(s, dt, this.analytics);
    applyThiefIncome(s, dt);
    maybeStartThieves(s);
    checkCraftUnlocks(s);
    checkBuyUnlocks(s);
    if (s.location === "space") tickSpace(s, dt);

    if (s.pop_timer != null && s.game_time_sec >= s.pop_timer) {
      var cap = s.buildings.hut * 4;
      var space = cap - s.population;
      if (space > 0) {
        var add = Math.max(1, Math.floor(space / 2) + Math.floor(Math.random() * Math.max(1, space - Math.floor(space / 2))));
        add = Math.min(add, space);
        s.population += add;
        syncGatherers(s);
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
    BUILDABLE.forEach(function (kind) {
      var n = s.buildings[kind] || 0;
      var max = buildingMax(kind);
      var cost = buildingCost(kind, n);
      if (!cost || !max) return;
      // @pacing kind=threshold id=craft_visible_ratio value=0.5 phase=forest
      if (!craftVisible(s, kind)) return;
      out.push({ kind: kind, cost: cost, have: n, max: max, can: canAfford(s, cost) && n < max && s.temperature > 1, section: "build" });
    });
    if ((s.buildings.workshop || 0) > 0) {
      CRAFT_KEYS.forEach(function (kind) {
        var spec = CRAFTABLE[kind];
        var n = s.stores[kind] || 0;
        var max = spec.max || 0;
        var cost = craftCost(kind);
        if (!cost) return;
        if (!craftVisible(s, kind)) return;
        var underMax = max <= 0 || n < max;
        out.push({
          kind: kind,
          cost: cost,
          have: n,
          max: max,
          can: canAfford(s, cost) && underMax && s.temperature > 1,
          section: "craft",
          type: spec.type
        });
      });
    }
    return out;
  };

  Game.prototype.visibleTrades = function () {
    var s = this.state;
    if ((s.buildings.trading_post || 0) <= 0) return [];
    var out = [];
    TRADE_KEYS.forEach(function (kind) {
      var spec = TRADEABLE[kind];
      var n = s.stores[kind] || 0;
      var max = spec.max || 0;
      var cost = tradeCost(kind);
      if (!cost) return;
      if (!buyVisible(s, kind)) return;
      var underMax = max <= 0 || n < max;
      out.push({
        kind: kind,
        cost: cost,
        have: n,
        max: max,
        can: canAfford(s, cost) && underMax,
        type: spec.type
      });
    });
    return out;
  };

  Game.prototype.visibleFabrications = function () {
    var s = this.state;
    if (!s.unlocked.fabricator) return [];
    var out = [];
    FABRICATE_KEYS.forEach(function (kind) {
      var spec = FABRICABLE[kind];
      if (!canFabricate(s, kind)) return;
      var n = s.stores[kind] || 0;
      var max = spec.max || 0;
      var cost = fabricateCost(kind);
      var qty = spec.quantity || 1;
      var underMax = max <= 0 || n < max;
      out.push({
        kind: kind,
        cost: cost,
        have: n,
        max: max,
        quantity: qty,
        can: canAfford(s, cost) && underMax,
        type: spec.type
      });
    });
    return out;
  };

  return {
    ITEMS: ITEMS,
    AREAS: AREAS,
    ITEM_CN: ITEM_CN,
    BUILDING_CN: BUILDING_CN,
    WORKER_CN: WORKER_CN,
    INCOME: INCOME,
    BUILDABLE: BUILDABLE,
    CRAFTABLE: CRAFTABLE,
    CRAFT_KEYS: CRAFT_KEYS,
    FABRICABLE: FABRICABLE,
    FABRICATE_KEYS: FABRICATE_KEYS,
    fabricateCost: fabricateCost,
    canFabricate: canFabricate,
    TRADEABLE: TRADEABLE,
    TRADE_KEYS: TRADE_KEYS,
    JOB_BUILDING: JOB_BUILDING,
    FIRE: FIRE,
    TEMP: TEMP,
    TOOL_SCHEMA: TOOL_SCHEMA,
    STRINGS: STRINGS,
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
    buildingMax: buildingMax,
    craftCost: craftCost,
    craftMax: craftMax,
    needsWorkshop: needsWorkshop,
    itemWeight: itemWeight,
    bagCapacity: bagCapacity,
    bagUsed: bagUsed,
    getMaxWater: getMaxWater,
    getMaxHealth: getMaxHealth,
    tradeCost: tradeCost,
    tradeMax: tradeMax,
    buyVisible: buyVisible,
    eventAvailable: eventAvailable,
    buttonAvailable: buttonAvailable,
    WEAPONS: WEAPONS,
    PERKS: PERKS,
    RADIUS: RADIUS,
    STICKINESS: STICKINESS,
    LIGHT_RADIUS: LIGHT_RADIUS,
    BASE_WATER: BASE_WATER,
    MOVES_PER_FOOD: MOVES_PER_FOOD,
    MOVES_PER_WATER: MOVES_PER_WATER,
    DEATH_COOLDOWN: DEATH_COOLDOWN,
    FIGHT_CHANCE: FIGHT_CHANCE,
    BASE_HEALTH: BASE_HEALTH,
    BASE_HIT_CHANCE: BASE_HIT_CHANCE,
    MEAT_HEAL: MEAT_HEAL,
    MEDS_HEAL: MEDS_HEAL,
    HYPO_HEAL: HYPO_HEAL,
    FIGHT_DELAY: FIGHT_DELAY,
    LIFTOFF_COOLDOWN: LIFTOFF_COOLDOWN,
    ALLOY_PER_HULL: ALLOY_PER_HULL,
    ALLOY_PER_THRUSTER: ALLOY_PER_THRUSTER,
    BASE_HULL: BASE_HULL,
    BASE_THRUSTERS: BASE_THRUSTERS,
    SHIP_SPEED: SHIP_SPEED,
    BASE_ASTEROID_DELAY: BASE_ASTEROID_DELAY,
    BASE_ASTEROID_SPEED: BASE_ASTEROID_SPEED,
    FTB_SPEED: FTB_SPEED,
    spaceLayerTitle: spaceLayerTitle,
    shipSpeed: shipSpeed,
    hasPerk: hasPerk,
    addPerk: addPerk,
    worldDistance: worldDistance,
    applySceneEffects: applySceneEffects,
    currentScene: currentScene,
    rollLoot: rollLoot,
    applyWorkerIncome: applyWorkerIncome,
    visibleJobs: visibleJobs,
    workerUnlocked: workerUnlocked,
    syncGatherers: syncGatherers,
    migrateState: migrateState,
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
