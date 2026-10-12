#!/usr/bin/env node
/** Headless playthrough of the rule director + early loop. */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "../build/web/package.json"));
const ADR = require("./engine.js");
const events = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/events.json"), "utf8"));

const game = new ADR.Game({ director: "rule", time_scale: 1, stuck_minutes: 99, snapshot_interval_sec: 60 }, events);

function step(sec, act) {
  if (act) game.act(act.name, act.args || {});
  const n = Math.ceil(sec / 0.25);
  for (let i = 0; i < n; i++) game.tick(0.25);
}

step(0.5);
game.act("light_fire");
step(31); // stranger
step(16); // outside unlock
game.act("travel", { area: "outside" });
game.act("gather_wood");
step(5);
// warm the room
game.act("travel", { area: "room" });
game.act("stoke_fire");
step(35);
game.act("stoke_fire");
step(90); // builder recovery
game.act("travel", { area: "room" });
step(2);

// grind wood with time scale
game.timeScale = 20;
while ((game.state.stores.wood || 0) < 30 && game.state.game_time_sec < 800) {
  if ((game.state.cooldowns.gather || 0) <= 0 && game.state.unlocked.outside) {
    game.act("travel", { area: "outside" });
    game.act("gather_wood");
  }
  if (game.state.builder_level >= 4 && (game.state.stores.wood || 0) >= 10 && game.state.buildings.trap < 1) {
    game.act("travel", { area: "room" });
    game.act("build", { kind: "trap" });
  }
  if (game.state.builder_level >= 4 && (game.state.stores.wood || 0) >= 30 && game.state.buildings.cart < 1) {
    game.act("travel", { area: "room" });
    game.act("build", { kind: "cart" });
  }
  step(2);
}
if (game.state.builder_level >= 4 && game.state.buildings.cart < 1 && (game.state.stores.wood || 0) >= 30) {
  game.act("travel", { area: "room" });
  game.act("build", { kind: "cart" });
}
while ((game.state.stores.wood || 0) < 100 && game.state.game_time_sec < 2000) {
  if ((game.state.cooldowns.gather || 0) <= 0) {
    game.act("travel", { area: "outside" });
    game.act("gather_wood");
  }
  if (game.state.buildings.trap > 0 && (game.state.cooldowns.traps || 0) <= 0) {
    game.act("check_traps");
  }
  step(3);
}
game.act("travel", { area: "room" });
if (game.state.buildings.hut < 1 && (game.state.stores.wood || 0) >= 100) {
  game.act("build", { kind: "hut" });
}
step(5);
if (game.state.buildings.trap > 0) {
  game.act("travel", { area: "outside" });
  game.act("check_traps");
  step(2);
}
if (game.state.active_event && game.state.active_event.id === "builder_finds_compass") {
  game.act("event_choice", { button: "take" });
}
step(2);

const names = game.analytics.buffer.map((e) => e.event_name);
const tools = game.analytics.buffer.filter((e) => e.event_name === "director_tool");
const okTools = tools.filter((e) => e.payload.result === "ok");

const report = {
  builder_level: game.state.builder_level,
  fire: game.state.fire,
  wood: game.state.stores.wood,
  buildings: game.state.buildings,
  unlocked: game.state.unlocked,
  compass: game.state.stores.compass,
  phase: game.state.phase,
  notes: game.state.notifications.slice(0, 8).map((n) => n.text),
  telemetry_events: names.length,
  director_tools_ok: okTools.length,
  has_session_start: names.includes("session_start"),
  has_player_action: names.includes("player_action"),
  chinese_wake: game.state.notifications.some((n) => n.text.includes("生火") || n.text.includes("火光") || n.text.includes("醒来")),
};

console.log(JSON.stringify(report, null, 2));
if (game.state.builder_level < 4) {
  console.error("FAIL: builder did not reach helping");
  process.exit(1);
}
if (!game.state.unlocked.outside) {
  console.error("FAIL: outside not unlocked");
  process.exit(1);
}
if (!report.has_session_start || !report.has_player_action || okTools.length < 3) {
  console.error("FAIL: telemetry incomplete");
  process.exit(1);
}
if (!report.chinese_wake) {
  console.error("FAIL: missing Chinese narration");
  process.exit(1);
}
console.log("SIMULATION_OK");
