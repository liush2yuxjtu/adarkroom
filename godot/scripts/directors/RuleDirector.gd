extends RefCounted
class_name RuleDirector
## Deterministic director that reproduces the original early-game pacing.

var seen: Dictionary = {}

func think() -> Array:
	var calls: Array = []
	var s := GameState
	var f := s.flags

	# @pacing kind=threshold id=light_spill_fire value=1 phase=room_fire note=fire must exceed this
	if s.fire > 1 and s.builder_level < 0 and not f.get("builder_light_spilled", false):
		_once(calls, "builder_light_spilled", [
			{ "tool": "set_flag", "args": { "key": "builder_level", "value": 0 } },
			{ "tool": "narrate", "args": { "text": Loc.t("the light from the fire spills from the windows, out into the dark"), "source": "room" } },
			# @pacing kind=trigger id=builder_arrives value=30s phase=room_fire min=28s max=35s
			{ "tool": "set_flag", "args": { "key": "builder_arrives_at", "value": s.game_time_sec + 30 } },
		])

	if s.builder_level == 0 and f.get("builder_arrives_at") != null and s.game_time_sec >= float(f.builder_arrives_at) and not f.get("stranger_arrived", false):
		_once(calls, "stranger_arrived", [
			{ "tool": "set_flag", "args": { "key": "builder_level", "value": 1 } },
			{ "tool": "change_npc_mood", "args": { "npc": "builder", "mood": "collapsed" } },
			{ "tool": "narrate", "args": { "text": Loc.t("a ragged stranger stumbles through the door and collapses in the corner"), "source": "room" } },
			# @pacing kind=trigger id=need_wood value=15s phase=stranger min=14s max=20s
			{ "tool": "set_flag", "args": { "key": "need_wood_at", "value": s.game_time_sec + 15 } },
		])

	if s.builder_level >= 1 and f.get("need_wood_at") != null and s.game_time_sec >= float(f.need_wood_at) and not f.get("outside_unlocked", false):
		_once(calls, "outside_unlocked", [
			{ "tool": "unlock_area", "args": { "area": "outside" } },
			# @pacing kind=income id=outside_starter_wood value=4 phase=forest
			{ "tool": "give_item", "args": { "item": "wood", "amount": 4 } },
			{ "tool": "narrate", "args": { "text": Loc.t("the wind howls outside"), "source": "room" } },
			{ "tool": "narrate", "args": { "text": Loc.t("the wood is running out"), "source": "room" } },
			# @pacing kind=trigger id=builder_tick value=30s phase=stranger
			{ "tool": "set_flag", "args": { "key": "next_builder_tick", "value": s.game_time_sec + 30 } },
		])

	# @pacing kind=threshold id=builder_warm value=3 phase=stranger note=temperature needed for builder ticks
	if s.builder_level >= 1 and s.builder_level < 3 and s.temperature >= 3:
		var nxt = f.get("next_builder_tick")
		var key := "builder_tick_%d" % (s.builder_level + 1)
		if nxt != null and s.game_time_sec >= float(nxt) and not f.get(key, false):
			var next_lv := s.builder_level + 1
			var mood := "shivering" if next_lv == 2 else "sleeping"
			var line := Loc.t("the stranger shivers, and mumbles quietly. her words are unintelligible.") if next_lv == 2 else Loc.t("the stranger in the corner stops shivering. her breathing calms.")
			_once(calls, key, [
				{ "tool": "set_flag", "args": { "key": "builder_level", "value": next_lv } },
				{ "tool": "change_npc_mood", "args": { "npc": "builder", "mood": mood } },
				{ "tool": "narrate", "args": { "text": line, "source": "room" } },
				# @pacing kind=trigger id=builder_tick value=30s phase=stranger
				{ "tool": "set_flag", "args": { "key": "next_builder_tick", "value": s.game_time_sec + 30 } },
			])

	if s.builder_level == 3 and s.location == "room" and not f.get("builder_helping", false):
		_once(calls, "builder_helping", [
			{ "tool": "set_flag", "args": { "key": "builder_level", "value": 4 } },
			{ "tool": "change_npc_mood", "args": { "npc": "builder", "mood": "helping" } },
			{ "tool": "narrate", "args": { "text": Loc.t("the stranger is standing by the fire. she says she can help. says she builds things."), "source": "room" } },
		])

	# @pacing kind=threshold id=compass_hut value=1 phase=village
	# @pacing kind=threshold id=compass_fur value=1 phase=village
	if int(s.buildings.hut) >= 1 and int(s.stores.fur) >= 1 and int(s.stores.compass) < 1 and not f.get("compass_offered", false):
		_once(calls, "compass_offered", [
			{ "tool": "spawn_event", "args": { "event_id": "builder_finds_compass" } },
		])

	if int(s.stores.compass) >= 1 and not s.unlocked.get("path", false):
		_once(calls, "path_unlocked", [
			{ "tool": "unlock_area", "args": { "area": "path" } },
			{ "tool": "unlock_area", "args": { "area": "world" } },
			{ "tool": "narrate", "args": { "text": Loc.t("the compass points east"), "source": "path" } },
		])

	if not f.get("wake_line", false):
		_once(calls, "wake_line", [
			{ "tool": "narrate", "args": { "text": "醒来。头在痛。眼前模糊。去生火吧", "source": "room" } },
		])

	# Persistent one-liner lives in GoalPrompt (not a quest HUD). Wake is the one-shot.

	return calls

func _once(calls: Array, key: String, extra: Array) -> void:
	if GameState.flags.get(key, false) or seen.get(key, false):
		return
	seen[key] = true
	calls.append({ "tool": "set_flag", "args": { "key": key, "value": true } })
	for c in extra:
		calls.append(c)
