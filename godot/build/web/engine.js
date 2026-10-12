/* This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * Remake of A Dark Room — Michael Townsend / doublespeak games. */
(function (root, factory) {
  var adr = factory();
  if (typeof module === "object" && module.exports) module.exports = adr;
  if (root) root.ADR = adr;
  return adr;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ITEMS = ["wood", "fur", "meat", "scales", "teeth", "cloth", "bait", "charm", "compass", "cured_meat"];
  var AREAS = ["room", "outside", "path", "world"];
  var NPCS = ["builder", "nomad", "villagers"];
  var MOODS = ["unknown", "collapsed", "shivering", "sleeping", "helping", "neutral", "wary", "grateful"];
  var FIRE = ["熄灭了", "开始冒烟", "冒出火苗", "燃烧着", "熊熊燃烧"];
  var TEMP = ["寒冷刺骨", "很冷", "很宜人", "暖和", "很热"];
  var ITEM_CN = {
    wood: "木头", fur: "毛皮", meat: "肉", scales: "鳞片", teeth: "牙齿",
    cloth: "布料", bait: "诱饵", charm: "符咒", compass: "罗盘", cured_meat: "熏肉"
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
    "and": "以及"
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
      session_id: uuid(),
      started_at: Date.now(),
      game_time_sec: 0,
      fire: 0,
      temperature: 0,
      builder_level: -1,
      npc_moods: { builder: "unknown", nomad: "neutral", villagers: "neutral" },
      stores: emptyStores(),
      wood_initialized: false,
      buildings: { trap: 0, cart: 0, hut: 0 },
      population: 0,
      workers: { gatherer: 0 },
      unlocked: { room: true, outside: false, path: false, world: false },
      location: "room",
      phase: "room_dark",
      flags: {},
      notifications: [],
      cooldowns: {},
      income_acc: { builder: 0, gatherer: 0 },
      pop_timer: null,
      event_timer: null,
      scheduled: [],
      active_event: null,
      combat: null,
      outfit: { meat: 0, cured_meat: 0 },
      world: {
        on_expedition: false,
        size: 11,
        x: 5,
        y: 5,
        water: 10,
        hp: 10,
        max_hp: 10,
        food_moves: 0,
        visited: {},
        landmarks: { "8,3": "old_house" },
        seen_danger: false
      },
      slice_complete: false
    };
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
    state.notifications.unshift({
      text: line,
      source: source || state.location,
      at: state.game_time_sec
    });
    if (state.notifications.length > 40) state.notifications.length = 40;
  }

  function addItem(state, item, amount) {
    if (ITEMS.indexOf(item) < 0) return;
    if (item === "wood") state.wood_initialized = true;
    state.stores[item] = Math.max(0, (state.stores[item] || 0) + amount);
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
    if (kind === "trap") return { wood: 10 + count * 10 };
    if (kind === "cart") return { wood: 30 };
    if (kind === "hut") return { wood: 100 + count * 50 };
    return null;
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

  function cooldownReady(state, id) {
    return !state.cooldowns[id] || state.cooldowns[id] <= 0;
  }

  function setCooldown(state, id, sec) {
    state.cooldowns[id] = sec;
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

    if (state.fire > 1 && state.builder_level < 0 && !f.builder_light_spilled) {
      once("builder_light_spilled", [
        { tool: "set_flag", args: { key: "builder_level", value: 0 } },
        { tool: "narrate", args: { text: t("the light from the fire spills from the windows, out into the dark"), source: "room" } },
        { tool: "set_flag", args: { key: "builder_arrives_at", value: state.game_time_sec + 30 } }
      ]);
    }

    if (state.builder_level === 0 && f.builder_arrives_at != null && state.game_time_sec >= f.builder_arrives_at && !f.stranger_arrived) {
      once("stranger_arrived", [
        { tool: "set_flag", args: { key: "builder_level", value: 1 } },
        { tool: "change_npc_mood", args: { npc: "builder", mood: "collapsed" } },
        { tool: "narrate", args: { text: t("a ragged stranger stumbles through the door and collapses in the corner"), source: "room" } },
        { tool: "set_flag", args: { key: "need_wood_at", value: state.game_time_sec + 15 } }
      ]);
    }

    if (state.builder_level >= 1 && f.need_wood_at != null && state.game_time_sec >= f.need_wood_at && !f.outside_unlocked) {
      once("outside_unlocked", [
        { tool: "unlock_area", args: { area: "outside" } },
        { tool: "give_item", args: { item: "wood", amount: 4 } },
        { tool: "narrate", args: { text: t("the wind howls outside"), source: "room" } },
        { tool: "narrate", args: { text: t("the wood is running out"), source: "room" } },
        { tool: "set_flag", args: { key: "next_builder_tick", value: state.game_time_sec + 30 } }
      ]);
    }

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

    if (state.builder_level >= 4 && !f.craft_hint_trap && (state.stores.wood || 0) >= 5) {
      once("craft_hint_trap", [
        { tool: "narrate", args: { text: t("builder says she can make traps to catch any creatures might still be alive out there"), source: "room" } }
      ]);
    }

    if (state.builder_level >= 4 && !f.craft_hint_cart && (state.stores.wood || 0) >= 15) {
      once("craft_hint_cart", [
        { tool: "narrate", args: { text: t("builder says she can make a cart for carrying wood"), source: "room" } }
      ]);
    }

    if (state.builder_level >= 4 && !f.craft_hint_hut && (state.stores.wood || 0) >= 50) {
      once("craft_hint_hut", [
        { tool: "narrate", args: { text: t("builder says there are more wanderers. says they'll work, too."), source: "room" } }
      ]);
    }

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
    this.stuckMinutes = opts.stuck_minutes || 3;
    this.snapshotEvery = opts.snapshot_interval_sec || 30;
    this.lastSnapshot = 0;
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

  Analytics.prototype.log = function (state, name, payload) {
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
    if (this.httpEnabled && this.httpEndpoint) this._post(ev);
    return ev;
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
    var storeSum = 0;
    ITEMS.forEach(function (k) { storeSum += state.stores[k] || 0; });
    var flags = Object.keys(state.flags).length;
    var unlocks = AREAS.filter(function (a) { return state.unlocked[a]; }).length;
    if (storeSum > this.lastProgress.stores || flags > this.lastProgress.flags || unlocks > this.lastProgress.unlocks) {
      this.lastProgress = { stores: storeSum, flags: flags, unlocks: unlocks, at: state.game_time_sec };
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
    if (state.game_time_sec - this.lastProgress.at >= this.stuckMinutes * 60 && state.game_time_sec - this.lastProgress.at < this.stuckMinutes * 60 + 1.2) {
      this.log(state, "stuck", { phase: state.phase, idle_sec: this.stuckMinutes * 60 });
    }
    if (state.game_time_sec - this.lastSnapshot >= this.snapshotEvery) {
      this.lastSnapshot = state.game_time_sec;
      this.log(state, "resource_snapshot", {
        stores: deepClone(state.stores),
        buildings: deepClone(state.buildings),
        fire: state.fire,
        population: state.population
      });
    }
  };

  function Game(config, events) {
    this.config = config || {};
    this.events = events || {};
    this.state = createState();
    this.timeScale = this.config.time_scale || 1;
    this.directorName = this.config.director || "rule";
    this.rule = new RuleDirector();
    this.analytics = new Analytics(this.config);
    this.listeners = [];
    this._llmBusy = false;
    this.analytics.log(this.state, "session_start", { director: this.directorName });
    this.directorTick();
  }

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
    if (!Array.isArray(calls)) return;
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
      this.analytics.log(this.state, "director_think", { director: "llm" });
      var headers = { "Content-Type": "application/json" };
      if (this.config.llm_api_key) headers.Authorization = "Bearer " + this.config.llm_api_key;
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
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
    this.analytics.log(this.state, "director_think", { director: "rule" });
    this.applyCalls(this.rule.think(this.state), "rule");
  };

  Game.prototype.act = function (action, args) {
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
          if (s.wood_initialized && s.stores.wood < 5) {
            pushNote(s, t("not enough wood to get the fire going"), "room");
            note = "no_wood";
            break;
          }
          if (s.wood_initialized) addItem(s, "wood", -5);
          s.fire = 3;
        } else {
          if (s.wood_initialized && s.stores.wood <= 0) {
            pushNote(s, t("the wood has run out"), "room");
            note = "no_wood";
            break;
          }
          if (s.wood_initialized) addItem(s, "wood", -1);
          s.fire = Math.min(4, s.fire + 1);
        }
        setCooldown(s, "stoke", 10);
        s.flags.fire_cool_at = s.game_time_sec + 300;
        break;
      case "gather_wood":
        if (!s.unlocked.outside) return { ok: false, error: "locked" };
        if (!cooldownReady(s, "gather")) return { ok: false, error: "cooldown" };
        addItem(s, "wood", s.buildings.cart > 0 ? 50 : 10);
        setCooldown(s, "gather", 60);
        pushNote(s, t("dry brush and dead branches litter the forest floor"), "outside");
        break;
      case "check_traps":
        if (s.buildings.trap <= 0) return { ok: false, error: "no_traps" };
        if (!cooldownReady(s, "traps")) return { ok: false, error: "cooldown" };
        var tr = trapDrops(s.buildings.trap, s.stores.bait || 0);
        grant(s, tr.drops);
        if (tr.baitUsed) addItem(s, "bait", -tr.baitUsed);
        setCooldown(s, "traps", 90);
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
        var max = kind === "trap" ? 10 : kind === "hut" ? 20 : 1;
        if (s.buildings[kind] >= max) return { ok: false, error: "max" };
        var cost = buildingCost(kind, s.buildings[kind]);
        if (!cost || !canAfford(s, cost)) return { ok: false, error: "cost" };
        pay(s, cost);
        s.buildings[kind] += 1;
        if (kind === "trap") pushNote(s, t("more traps to catch more creatures"), "room");
        if (kind === "cart") pushNote(s, t("the rickety cart will carry more wood from the forest"), "room");
        if (kind === "hut") {
          pushNote(s, t("builder puts up a hut, out in the forest. says word will get around."), "room");
          if (s.pop_timer == null) s.pop_timer = s.game_time_sec + 30 + Math.random() * 150;
        }
        break;
      case "travel":
        if (!s.unlocked[args.area] && args.area !== "room") return { ok: false, error: "locked" };
        if (s.world.on_expedition) return { ok: false, error: "away" };
        s.location = args.area;
        break;
      case "pack":
        var item = args.item;
        var n = args.amount | 0;
        if (ITEMS.indexOf(item) < 0) return { ok: false, error: "item" };
        if (n > 0) {
          var have = s.stores[item] || 0;
          var take = Math.min(n, have);
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
        s.world.x = 5;
        s.world.y = 5;
        s.world.water = 10;
        s.world.hp = 10;
        s.world.food_moves = 0;
        s.location = "world";
        s.world.visited["5,5"] = true;
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
        s.world.water -= 1;
        s.world.food_moves += 1;
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
        if (nx === 5 && ny === 5) {
          this._goHome(true);
          break;
        }
        var d = Math.abs(nx - 5) + Math.abs(ny - 5);
        if (d >= 4 && !s.world.seen_danger) {
          s.world.seen_danger = true;
          pushNote(s, t("dangerous to be this far from the village without proper protection"), "world");
        }
        var lm = s.world.landmarks[nx + "," + ny];
        if (lm && !s.active_event) {
          executeTool(s, { tool: "spawn_event", args: { event_id: lm } }, { events: this.events });
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
      case "event_choice":
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
        this.timeScale = Math.max(0.25, Math.min(20, args.scale || 1));
        break;
      case "set_analytics":
        this.analytics.httpEndpoint = args.endpoint || "";
        this.analytics.httpEnabled = !!args.enabled;
        this.analytics.extraHeaders = args.headers || {};
        this.config.analytics_endpoint = this.analytics.httpEndpoint;
        break;
      case "restart":
        var oldA = this.analytics;
        oldA.log(s, "session_end", { reason: "restart" });
        this.state = createState();
        this.rule = new RuleDirector();
        this.analytics.log(this.state, "session_start", { director: this.directorName, restart: true });
        break;
      case "quit":
        this.analytics.log(s, "quit", {});
        this.analytics.log(s, "session_end", { reason: "quit" });
        break;
      default:
        return { ok: false, error: "unknown_action" };
    }
    this.analytics.log(s, "player_action", { action: action, args: args, note: note });
    s.phase = derivePhase(s);
    this.directorTick();
    this.emit();
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
        if (sc.water && s.world.on_expedition) s.world.water = Math.min(10, s.world.water + sc.water);
        return;
      }
    }
    if (btn.next && btn.next !== "end" && spec.scenes && spec.scenes[btn.next]) {
      s.active_event.scene = btn.next;
      var sc2 = spec.scenes[btn.next];
      if (sc2.reward) grant(s, sc2.reward);
      if (sc2.set_flag) s.flags[sc2.set_flag] = true;
      if (sc2.water && s.world.on_expedition) s.world.water = Math.min(10, s.world.water + sc2.water);
      return;
    }
    if (spec.scenes && scene !== spec && scene.set_flag) s.flags[scene.set_flag] = true;
    s.active_event = null;
    if (s.combat) s.combat = null;
  };

  Game.prototype._combat = function (move) {
    var s = this.state;
    if (!s.combat) return;
    if (move === "punch") {
      s.combat.hp -= 1 + (Math.random() < 0.3 ? 1 : 0);
      if (Math.random() < 0.55) s.world.hp -= s.combat.dmg;
      if (s.combat.hp <= 0) {
        grant(s, s.combat.reward);
        pushNote(s, "咆哮的野兽倒下了。", "world");
        s.combat = null;
        s.active_event = null;
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
    var dt = dtReal * this.timeScale;
    s.game_time_sec += dt;
    Object.keys(s.cooldowns).forEach(function (k) {
      s.cooldowns[k] = Math.max(0, s.cooldowns[k] - dt);
    });

    if (s.flags.fire_cool_at != null && s.game_time_sec >= s.flags.fire_cool_at && s.fire > 0) {
      if (s.builder_level > 3 && s.fire <= 2 && (s.stores.wood || 0) > 0) {
        addItem(s, "wood", -1);
        s.fire = Math.min(4, s.fire + 1);
        pushNote(s, t("builder stokes the fire"), "room");
      } else {
        s.fire = Math.max(0, s.fire - 1);
      }
      s.flags.fire_cool_at = s.fire > 0 ? s.game_time_sec + 300 : null;
    }

    if (!s.flags.next_temp_at) s.flags.next_temp_at = s.game_time_sec + 30;
    if (s.game_time_sec >= s.flags.next_temp_at) {
      if (s.temperature > s.fire) s.temperature -= 1;
      else if (s.temperature < s.fire) s.temperature += 1;
      s.flags.next_temp_at = s.game_time_sec + 30;
    }

    if (s.builder_level >= 4) {
      s.income_acc.builder += dt;
      if (s.income_acc.builder >= 10) {
        var n = Math.floor(s.income_acc.builder / 10);
        s.income_acc.builder -= n * 10;
        addItem(s, "wood", 2 * n);
      }
    }
    var g = s.workers.gatherer || (s.population > 0 ? s.population : 0);
    if (g > 0) {
      s.income_acc.gatherer += dt;
      if (s.income_acc.gatherer >= 10) {
        var gn = Math.floor(s.income_acc.gatherer / 10);
        s.income_acc.gatherer -= gn * 10;
        addItem(s, "wood", g * gn);
      }
    }

    if (s.pop_timer != null && s.game_time_sec >= s.pop_timer) {
      var cap = s.buildings.hut * 4;
      var space = cap - s.population;
      if (space > 0) {
        var add = Math.max(1, Math.floor(space / 2) + Math.floor(Math.random() * Math.max(1, space - Math.floor(space / 2))));
        add = Math.min(add, space);
        s.population += add;
        s.workers.gatherer = s.population;
        if (add === 1) pushNote(s, t("a stranger arrives in the night"), "outside");
        else if (add <= 3) pushNote(s, "一户饱经风雨的人家住进一栋小屋。", "outside");
        else pushNote(s, "一群瘦骨嶙峋，风尘仆仆的人抵达了。", "outside");
      }
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
    if (s.flags._dir_acc >= 1) {
      s.flags._dir_acc = 0;
      this.directorTick();
    }

    s.phase = derivePhase(s);
    this.analytics.tickChecks(s);
    this.emit();
  };

  Game.prototype.visibleCrafts = function () {
    var s = this.state;
    if (s.builder_level < 4) return [];
    var out = [];
    ["trap", "cart", "hut"].forEach(function (kind) {
      var n = s.buildings[kind];
      var max = kind === "trap" ? 10 : kind === "hut" ? 20 : 1;
      var cost = buildingCost(kind, n);
      var woodNeed = cost.wood || 0;
      var show = (s.stores.wood || 0) >= woodNeed * 0.5;
      if (show) out.push({ kind: kind, cost: cost, have: n, max: max, can: canAfford(s, cost) && n < max && s.temperature > 1 });
    });
    return out;
  };

  return {
    ITEMS: ITEMS,
    ITEM_CN: ITEM_CN,
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
    buildingCost: buildingCost,
    terrainAt: terrainAt,
    hutTitle: hutTitle,
    roomTitle: roomTitle,
    generateWorldSeed: generateWorldSeed
  };
});
