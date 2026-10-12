#!/usr/bin/env node
/* Unit check: cooldown remaining is end-now, not dt accumulation. */
var ADR = require("../build/web/engine.js");
var fails = [];

function near(actual, expected, slack, label) {
  if (Math.abs(actual - expected) > slack) {
    fails.push(label + ": got " + actual + ", expected ~" + expected);
  }
}

var s = ADR.createState();
ADR.setCooldown(s, "stoke", 10, 1);
near(ADR.cooldownLeft(s, "stoke", 1), 10, 0.05, "stoke just set");
if (!s.cooldown_ends_at.stoke || s.cooldown_ends_at.stoke < Date.now()) {
  fails.push("stoke ends_at should be in the future");
}

s.cooldown_ends_at.stoke = Date.now() + 3500;
near(ADR.cooldownLeft(s, "stoke", 1), 3.5, 0.15, "stoke 3.5s wall left");
if (ADR.cooldownReady(s, "stoke")) fails.push("stoke should not be ready at 3.5s");

s.cooldown_ends_at.stoke = Date.now() - 50;
ADR.syncCooldowns(s, 1);
if (!ADR.cooldownReady(s, "stoke")) fails.push("stoke should be ready after end");
if (s.cooldowns.stoke) fails.push("expired stoke remaining should be cleared");

ADR.setCooldown(s, "gather", 60, 2);
near(ADR.cooldownLeft(s, "gather", 2), 60, 0.2, "gather 2x starts at 60 game-sec");
near((s.cooldown_ends_at.gather - Date.now()) / 1000, 30, 0.2, "gather 2x wall is 30s");

var old = ADR.createState();
old.cooldowns.traps = 12;
var adopted = ADR.hydrateState(old);
near(ADR.cooldownLeft(adopted, "traps", 1), 12, 0.2, "old save remaining becomes ends_at");
if (!adopted.cooldown_ends_at.traps) fails.push("hydrate should invent ends_at from remaining");

if (fails.length) {
  console.error("FAIL\n" + fails.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  stoke_left: ADR.cooldownLeft(s, "stoke", 1),
  gather_end_wall: Math.round((s.cooldown_ends_at.gather - Date.now()) / 100) / 10,
  traps_left: ADR.cooldownLeft(adopted, "traps", 1)
}));
