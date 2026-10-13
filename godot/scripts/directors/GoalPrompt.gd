extends RefCounted
class_name GoalPrompt
## Persistent dark-room one-liner. First matching early gate wins.
## Tone matches RuleDirector wake_line: short, atmospheric Chinese. Not a quest HUD.
## Analytics.log_event stamps payload.client_version.

static func derive() -> Dictionary:
	var s := GameState
	if s.slice_complete:
		return {}
	if s.world.get("on_expedition", false):
		return {}
	var wood := int(s.stores.get("wood", 0))
	var trap := int(s.buildings.get("trap", 0))
	var cart := int(s.buildings.get("cart", 0))
	var hut := int(s.buildings.get("hut", 0))
	var outside := bool(s.unlocked.get("outside", false))
	var path := bool(s.unlocked.get("path", false))
	var bl := s.builder_level
	var loc := s.location
	var seen_forest := bool(s.flags.get("goal_entered_forest", false))
	if s.fire <= 0:
		return { "id": "light_fire", "text": "火灭了，生火", "stage": "room_dark", "action": "light_fire" }
	if not outside and bl < 1:
		return { "id": "stoke_fire", "text": "火还在，添柴", "stage": "room_fire", "action": "stoke_fire" }
	if not outside and bl >= 1:
		return { "id": "warm_stranger", "text": "陌生人还在发抖，添柴", "stage": "stranger", "action": "stoke_fire" }
	if outside and not seen_forest and loc != "outside" and loc != "path" and loc != "world":
		return { "id": "go_forest", "text": "去森林看看", "stage": "forest", "action": "travel", "action_args": { "area": "outside" } }
	if bl < 4:
		return { "id": "gather_wood", "text": "林地上有枯枝，伐木", "stage": "forest", "action": "gather_wood" }
	if trap < 1:
		if wood >= 10:
			return { "id": "build_trap", "text": "木头够了，做陷阱", "stage": "forest", "action": "build", "action_args": { "kind": "trap" } }
		return { "id": "gather_for_trap", "text": "木头不够，去伐木", "stage": "forest", "action": "gather_wood" }
	if cart < 1:
		if wood >= 30:
			return { "id": "build_cart", "text": "木头够了，造货车", "stage": "forest", "action": "build", "action_args": { "kind": "cart" } }
		return { "id": "gather_for_cart", "text": "去伐木，造货车", "stage": "forest", "action": "gather_wood" }
	if hut < 1:
		if wood >= 100:
			return { "id": "build_hut", "text": "木头够了，建小屋", "stage": "forest", "action": "build", "action_args": { "kind": "hut" } }
		return { "id": "gather_for_hut", "text": "去伐木，建小屋", "stage": "forest", "action": "gather_wood" }
	if not path:
		return { "id": "check_traps", "text": "去看看陷阱", "stage": "village", "action": "check_traps" }
	return { "id": "follow_compass", "text": "罗盘指向东方", "stage": "path", "action": "embark" }

static func _matches(goal: Dictionary, action: String, args: Dictionary) -> bool:
	if goal.is_empty() or str(goal.get("action", "")) != action:
		return false
	var want: Dictionary = goal.get("action_args", {})
	if typeof(want) != TYPE_DICTIONARY or want.is_empty():
		return true
	for k in want.keys():
		if args.get(k) != want[k]:
			return false
	return true

static func sync(acted_action: String = "", acted_args: Dictionary = {}) -> void:
	var s := GameState
	var prev: Dictionary = s.goal if typeof(s.goal) == TYPE_DICTIONARY else {}
	if acted_action != "" and not prev.is_empty() and _matches(prev, acted_action, acted_args):
		var acted_key := "goal_acted_%s" % str(prev.get("id", ""))
		if not bool(s.flags.get(acted_key, false)):
			s.flags[acted_key] = true
			Analytics.log_event("goal_prompt_acted", {
				"goal_id": prev.get("id"),
				"text": prev.get("text"),
				"stage": prev.get("stage"),
				"action": acted_action
			})
	if acted_action == "travel" and acted_args.get("area") == "outside":
		s.flags["goal_entered_forest"] = true
	var next := derive()
	s.goal = next
	var next_id := str(next.get("id", ""))
	var next_stage := str(next.get("stage", ""))
	var prev_id := str(prev.get("id", ""))
	var prev_stage := str(prev.get("stage", ""))
	if next_id == prev_id:
		return
	s.flags["goal_id"] = next_id
	s.flags["goal_text"] = str(next.get("text", ""))
	s.flags["goal_stage"] = next_stage
	if not next.is_empty():
		Analytics.log_event("goal_prompt_shown", {
			"goal_id": next.get("id"),
			"text": next.get("text"),
			"stage": next.get("stage")
		})
		if next_stage != "" and next_stage != prev_stage:
			Analytics.log_event("stage_reached", {
				"stage": next_stage,
				"goal_id": next.get("id")
			})
