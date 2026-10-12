extends Node
## Validates and executes named narrative tools.

const TOOL_NAMES := ["spawn_event", "give_item", "change_npc_mood", "narrate", "unlock_area", "set_flag"]
const ITEMS := ["wood", "fur", "meat", "scales", "teeth", "cloth", "bait", "charm", "compass", "cured_meat"]
const AREAS := ["room", "outside", "path", "world"]
const NPCS := ["builder", "nomad", "villagers"]
const MOODS := ["unknown", "collapsed", "shivering", "sleeping", "helping", "neutral", "wary", "grateful"]

func schema() -> Array:
	return [
		{ "name": "spawn_event", "params": { "event_id": "string", "payload": "object?" } },
		{ "name": "give_item", "params": { "item": "string", "amount": "number" } },
		{ "name": "change_npc_mood", "params": { "npc": "string", "mood": "string" } },
		{ "name": "narrate", "params": { "text": "string", "source": "string?" } },
		{ "name": "unlock_area", "params": { "area": "string" } },
		{ "name": "set_flag", "params": { "key": "string", "value": "any" } },
	]

func validate(call: Dictionary) -> String:
	var tool := str(call.get("tool", ""))
	if not TOOL_NAMES.has(tool):
		return "unknown tool: %s" % tool
	var a: Dictionary = call.get("args", {})
	match tool:
		"spawn_event":
			if str(a.get("event_id", "")) == "":
				return "event_id required"
			if not GameState.events_catalog.has(a.get("event_id")):
				return "unknown event_id"
		"give_item":
			if not ITEMS.has(str(a.get("item", ""))):
				return "illegal item"
			if typeof(a.get("amount")) != TYPE_FLOAT and typeof(a.get("amount")) != TYPE_INT:
				return "amount must be a number"
		"change_npc_mood":
			if not NPCS.has(str(a.get("npc", ""))):
				return "illegal npc"
			if not MOODS.has(str(a.get("mood", ""))):
				return "illegal mood"
		"narrate":
			if str(a.get("text", "")) == "":
				return "text required"
		"unlock_area":
			if not AREAS.has(str(a.get("area", ""))):
				return "illegal area"
		"set_flag":
			if str(a.get("key", "")) == "":
				return "key required"
	return ""

func execute(call: Dictionary) -> Dictionary:
	var err := validate(call)
	if err != "":
		return { "ok": false, "error": err }
	var a: Dictionary = call.get("args", {})
	match str(call.get("tool")):
		"narrate":
			GameState.push_note(str(a.get("text")), str(a.get("source", "")))
		"give_item":
			GameState.add_item(str(a.item), int(a.amount))
		"change_npc_mood":
			GameState.npc_moods[str(a.npc)] = str(a.mood)
		"unlock_area":
			GameState.unlocked[str(a.area)] = true
			if str(a.area) == "outside" and not GameState.wood_initialized:
				GameState.add_item("wood", 0)
		"set_flag":
			GameState.flags[str(a.key)] = a.get("value")
			if str(a.key) == "builder_level":
				GameState.builder_level = int(a.get("value"))
		"spawn_event":
			if GameState.active_event != null:
				return { "ok": false, "error": "event already open" }
			var spec: Dictionary = GameState.events_catalog[a.event_id]
			GameState.active_event = { "id": a.event_id, "scene": "start", "spec": spec, "payload": a.get("payload", {}) }
			if spec.has("notification"):
				GameState.push_note(str(spec.notification), GameState.location)
	return { "ok": true }

func apply_calls(calls: Array, origin: String) -> void:
	var n := 0
	for raw in calls:
		if n >= 8:
			break
		n += 1
		if typeof(raw) != TYPE_DICTIONARY:
			Analytics.log_event("director_tool", { "result": "rejected", "error": "not an object", "origin": origin })
			continue
		var call: Dictionary = raw
		var delay := float(call.get("delay_sec", 0))
		if delay > 0.0:
			GameState.scheduled.append({ "at": GameState.game_time_sec + delay, "call": call, "origin": origin })
			continue
		var result := execute(call)
		Analytics.log_event("director_tool", {
			"tool": call.get("tool"),
			"args": call.get("args", {}),
			"result": "ok" if result.ok else "rejected",
			"error": result.get("error", null),
			"origin": origin
		})
		if result.ok:
			var tool := str(call.get("tool"))
			var a: Dictionary = call.get("args", {})
			if tool == "change_npc_mood":
				Analytics.log_event("npc_interact", { "npc": a.get("npc"), "mood": a.get("mood"), "origin": origin, "moods": GameState.npc_moods.duplicate() })
			elif tool == "narrate" or tool == "spawn_event":
				Analytics.log_event("dialogue", { "tool": tool, "event_id": a.get("event_id", null), "text": str(a.get("text", "")).substr(0, 160), "origin": origin })
			elif tool == "unlock_area":
				Analytics.log_event("unlock", { "area": a.get("area"), "origin": origin, "unlocked": GameState.unlocked.duplicate() })
	GameState.notify_changed()
