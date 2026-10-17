#!/usr/bin/env node
/**
 * One-shot converter: original script/events/setpieces.js → remake events.json.
 * Chinese via lang/zh_cn + godot/data/strings_zh.json. house → old_house.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadZh() {
  const src = rd("lang/zh_cn/strings.js");
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  let zh = {};
  try {
    zh = JSON.parse(src.slice(start, end + 1));
  } catch {
    zh = Function(`"use strict"; return (${src.slice(start, end + 1)});`)();
  }
  try {
    Object.assign(zh, JSON.parse(rd("godot/data/strings_zh.json")));
  } catch {
    /* optional overlay */
  }
  return zh;
}

const ZH = loadZh();
const _ = (s) => (ZH[s] != null ? ZH[s] : s);
const snake = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const ctx = {
  Events: { Setpieces: {}, _LEAVE_COOLDOWN: 1 },
  AudioLibrary: new Proxy({}, { get: () => "" }),
  World: {
    useOutpost() {},
    markVisited() {},
    setWater() {},
    getMaxWater() { return 10; },
    drawRoad() {},
    state: {},
    curPos: [0, 0]
  },
  $SM: { addPerk() {}, set() {}, add() {}, get() { return 0; } },
  Prestige: { collectStores() {} },
  Notifications: { notify() {} },
  _: _
};
vm.runInNewContext(rd("script/events/setpieces.js"), ctx, { filename: "setpieces.js" });

function convertLoot(loot) {
  if (!loot) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(loot)) {
    if (!v || typeof v !== "object") continue;
    out[snake(k)] = {
      min: v.min == null ? 1 : v.min,
      max: v.max == null ? (v.min == null ? 1 : v.min) : v.max,
      chance: v.chance == null ? 1 : v.chance
    };
  }
  return Object.keys(out).length ? out : undefined;
}

function convertCost(cost) {
  if (!cost) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(cost)) out[snake(k)] = Number(v);
  return Object.keys(out).length ? out : undefined;
}

function nextFrom(nextScene) {
  if (nextScene == null) return {};
  if (typeof nextScene === "string") return nextScene === "end" ? { next: "end" } : { next: nextScene };
  const keys = Object.keys(nextScene).map(Number).sort((a, b) => a - b);
  const weights = {};
  let prev = 0;
  for (const t of keys) {
    const name = nextScene[t] != null ? nextScene[t] : nextScene[String(t)];
    weights[name] = Math.round((t - prev) * 1000) / 1000;
    prev = t;
  }
  const names = Object.keys(weights);
  if (names.length === 1) return names[0] === "end" ? { next: "end" } : { next: names[0] };
  return { random_next: weights };
}

function parseOnload(fn, eventId) {
  if (typeof fn !== "function") return undefined;
  const src = fn.toString();
  const fx = {};
  if (/markVisited/.test(src)) fx.mark_visited = true;
  if (/setWater|getMaxWater/.test(src)) fx.set_water = true;
  if (/useOutpost/.test(src)) fx.use_outpost = true;
  const perk = src.match(/addPerk\(\s*['"]([^'"]+)['"]/);
  if (perk) fx.learn = snake(perk[1]);
  if (/cityCleared/.test(src)) fx.city_cleared = true;
  if (/\.ironmine/.test(src)) fx.world_flag = "ironmine";
  if (/\.coalmine/.test(src)) fx.world_flag = "coalmine";
  if (/\.sulphurmine/.test(src)) fx.world_flag = "sulphurmine";
  if (/\.ship\s*=/.test(src)) fx.world_flag = "ship";
  if (/collectStores/.test(src)) fx.collect_stores = true;
  if ((eventId === "old_house" || eventId === "house") && fx.mark_visited) fx.visited_old_house = true;
  return Object.keys(fx).length ? fx : undefined;
}

function convertButtons(buttons) {
  if (!buttons) return [];
  return Object.entries(buttons).map(([id, b]) => {
    const out = { id, text: b.text };
    const cost = convertCost(b.cost);
    if (cost) out.cost = cost;
    Object.assign(out, nextFrom(b.nextScene));
    return out;
  });
}

function convertScene(scene, eventId) {
  const out = {};
  if (scene.text) out.text = scene.text.slice();
  if (scene.notification) out.notification = scene.notification;
  const onload = parseOnload(scene.onLoad, eventId);
  if (onload) out.onload = onload;
  if (scene.combat) {
    out.combat = {
      hp: scene.health || 4,
      dmg: scene.damage || 1,
      hit: scene.hit == null ? 0.8 : scene.hit,
      name: scene.enemyName || _(scene.enemy) || scene.enemy || "敌人",
      death: scene.enemy ? `${_(scene.enemy)}倒下了` : "倒下了",
      loot: convertLoot(scene.loot) || null
    };
  } else {
    const loot = convertLoot(scene.loot);
    if (loot) out.loot = loot;
  }
  out.buttons = convertButtons(scene.buttons);
  return out;
}

function convertEvent(id, spec) {
  const remakeId = id === "house" ? "old_house" : id;
  const scenes = {};
  for (const [name, scene] of Object.entries(spec.scenes || {})) {
    scenes[name] = convertScene(scene, remakeId);
  }
  const start = scenes.start || {};
  const ev = {
    title: spec.title,
    notification: start.notification || spec.notification || spec.title,
    text: start.text || [],
    buttons: start.buttons || [{ id: "leave", text: _("leave"), next: "end" }],
    scenes
  };
  return [remakeId, ev];
}

const existing = JSON.parse(rd("godot/data/events.json"));
const setpieces = ctx.Events.Setpieces;
for (const [id, spec] of Object.entries(setpieces)) {
  const [rid, ev] = convertEvent(id, spec);
  existing[rid] = ev;
}

existing.executioner = {
  title: ZH["A Ravaged Battleship"] || "残破战舰",
  notification: "一艘被摧毁的战舰横亘在尘土中。",
  text: [
    "一艘被毁的战舰横在尘土上。",
    "舱门紧闭，内部的通道尚不可及。"
  ],
  buttons: [{ id: "leave", text: _("leave") || "离开", next: "end" }],
  scenes: {
    start: {
      text: [
        "一艘被毁的战舰横在尘土上。",
        "舱门紧闭，内部的通道尚不可及。"
      ],
      onload: { mark_visited: true },
      buttons: [{ id: "leave", text: _("leave") || "离开", next: "end" }]
    }
  }
};

const json = JSON.stringify(existing, null, 2) + "\n";
fs.writeFileSync(path.join(ROOT, "godot/data/events.json"), json);
fs.writeFileSync(path.join(ROOT, "godot/build/web/data/events.json"), json);
const ids = Object.keys(setpieces).map((k) => (k === "house" ? "old_house" : k)).concat("executioner");
console.log(JSON.stringify({ wrote: ids, bytes: json.length }, null, 2));
