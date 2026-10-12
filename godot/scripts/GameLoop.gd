extends Node
class_name GameLoop
## Player actions and world clocks. Directors only speak through tools.

signal acted

func act(action: String, args: Dictionary = {}) -> Dictionary:
	var s := GameState
	match action:
		"light_fire", "stoke_fire":
			if (s.cooldowns.get("stoke", 0.0) as float) > 0.0:
				return { "ok": false, "error": "cooldown" }
			if s.fire <= 0:
				if s.wood_initialized and int(s.stores.wood) < 5:
					s.push_note(Loc.t("not enough wood to get the fire going"), "room")
				else:
					if s.wood_initialized:
						s.add_item("wood", -5)
					s.fire = 3
					s.cooldowns["stoke"] = 10.0
					s.flags["fire_cool_at"] = s.game_time_sec + 300
			else:
				if s.wood_initialized and int(s.stores.wood) <= 0:
					s.push_note(Loc.t("the wood has run out"), "room")
				else:
					if s.wood_initialized:
						s.add_item("wood", -1)
					s.fire = mini(4, s.fire + 1)
					s.cooldowns["stoke"] = 10.0
					s.flags["fire_cool_at"] = s.game_time_sec + 300
		"gather_wood":
			if not s.unlocked.outside:
				return { "ok": false }
			if (s.cooldowns.get("gather", 0.0) as float) > 0.0:
				return { "ok": false }
			s.add_item("wood", 50 if int(s.buildings.cart) > 0 else 10)
			s.cooldowns["gather"] = 60.0
			s.push_note(Loc.t("dry brush and dead branches litter the forest floor"), "outside")
		"check_traps":
			if int(s.buildings.trap) <= 0:
				return { "ok": false }
			var n: int = int(s.buildings.trap)
			var bait: int = mini(int(s.stores.bait), n)
			for i in n + bait:
				var roll := randf()
				if roll < 0.5:
					s.add_item("fur", 1)
				elif roll < 0.75:
					s.add_item("meat", 1)
				elif roll < 0.85:
					s.add_item("scales", 1)
				elif roll < 0.93:
					s.add_item("teeth", 1)
				elif roll < 0.995:
					s.add_item("cloth", 1)
				else:
					s.add_item("charm", 1)
			if bait:
				s.add_item("bait", -bait)
			s.cooldowns["traps"] = 90.0
			s.push_note(Loc.t("the traps contain ") + "猎物", "outside")
		"build":
			if s.builder_level < 4:
				return { "ok": false }
			if s.temperature <= 1:
				s.push_note(Loc.t("builder just shivers"), "room")
				return { "ok": false }
			var kind := str(args.get("kind", ""))
			var cost_wood := 0
			if kind == "trap":
				cost_wood = 10 + int(s.buildings.trap) * 10
			elif kind == "cart":
				cost_wood = 30
			elif kind == "hut":
				cost_wood = 100 + int(s.buildings.hut) * 50
			else:
				return { "ok": false }
			if int(s.stores.wood) < cost_wood:
				return { "ok": false }
			s.add_item("wood", -cost_wood)
			s.buildings[kind] = int(s.buildings[kind]) + 1
			if kind == "hut" and s.pop_timer == null:
				s.pop_timer = s.game_time_sec + 30 + randf() * 150
			Analytics.log_event("build", {
				"kind": kind,
				"cost": { "wood": cost_wood },
				"have": int(s.buildings[kind]),
				"buildings": s.buildings.duplicate()
			})
		"travel":
			var area := str(args.get("area", "room"))
			if area != "room" and not s.unlocked.get(area, false):
				return { "ok": false }
			s.location = area
		"embark":
			if int(s.outfit.get("meat", 0)) + int(s.outfit.get("cured_meat", 0)) <= 0:
				return { "ok": false }
			s.world.on_expedition = true
			s.world.x = 5
			s.world.y = 5
			s.world.water = 10
			s.world.hp = 10
			s.location = "world"
		"world_move":
			if not s.world.on_expedition:
				return { "ok": false }
			var nx: int = int(s.world.x) + int(args.get("dx", 0))
			var ny: int = int(s.world.y) + int(args.get("dy", 0))
			if nx < 0 or ny < 0 or nx >= 11 or ny >= 11:
				return { "ok": false }
			s.world.x = nx
			s.world.y = ny
			if nx == 5 and ny == 5:
				_go_home(true)
		"event_choice":
			var ev_id: Variant = null
			if s.active_event != null and typeof(s.active_event) == TYPE_DICTIONARY:
				ev_id = (s.active_event as Dictionary).get("id")
			Analytics.log_event("dialogue_choice", {
				"event_id": ev_id,
				"button": args.get("button")
			})
			s.active_event = null
		"restart":
			var recent: Array = Analytics.recent_actions.duplicate()
			var last_phase := s.phase
			var last_play := s.game_time_sec
			Analytics.log_event("session_end", { "reason": "restart" })
			s.reset()
			Analytics.log_event("session_start", { "director": DirectorHost.director_name, "restart": true })
			Analytics.log_event("new_game_start", {
				"overwritten": true,
				"previous_phase": last_phase,
				"previous_play_time_sec": last_play,
				"recent_actions": recent,
				"last_phase": last_phase
			})
			Analytics.recent_actions = []
		_:
			return { "ok": false, "error": "unknown" }
	Analytics.log_event("player_action", { "action": action, "args": args })
	if action in ["light_fire", "stoke_fire", "gather_wood", "build"]:
		Analytics.log_audio(action, { "src": "godot" })
	s.notify_changed()
	DirectorHost._think()
	acted.emit()
	return { "ok": true }

func tick(dt_real: float) -> void:
	var s := GameState
	var dt := dt_real * s.time_scale
	s.game_time_sec += dt
	for k in s.cooldowns.keys():
		s.cooldowns[k] = max(0.0, float(s.cooldowns[k]) - dt)
	if s.flags.get("fire_cool_at") != null and s.game_time_sec >= float(s.flags.fire_cool_at) and s.fire > 0:
		if s.builder_level > 3 and s.fire <= 2 and int(s.stores.wood) > 0:
			s.add_item("wood", -1)
			s.fire = mini(4, s.fire + 1)
			s.push_note(Loc.t("builder stokes the fire"), "room")
		else:
			s.fire = maxi(0, s.fire - 1)
		s.flags.fire_cool_at = s.game_time_sec + 300 if s.fire > 0 else null
	if not s.flags.has("next_temp_at"):
		s.flags.next_temp_at = s.game_time_sec + 30
	if s.game_time_sec >= float(s.flags.next_temp_at):
		if s.temperature > s.fire:
			s.temperature -= 1
		elif s.temperature < s.fire:
			s.temperature += 1
		s.flags.next_temp_at = s.game_time_sec + 30
	if s.builder_level >= 4:
		s.income_acc.builder = float(s.income_acc.builder) + dt
		if s.income_acc.builder >= 10:
			var n := int(s.income_acc.builder / 10.0)
			s.income_acc.builder = float(s.income_acc.builder) - n * 10
			s.add_item("wood", 2 * n)
	var due: Array = []
	var still: Array = []
	for job in s.scheduled:
		if s.game_time_sec >= float(job.at):
			due.append(job)
		else:
			still.append(job)
	s.scheduled = still
	for job in due:
		var result := ToolExecutor.execute(job.call)
		Analytics.log_event("director_tool", { "tool": job.call.get("tool"), "result": "ok" if result.ok else "rejected", "origin": "scheduled" })
	if s.pop_timer != null and s.game_time_sec >= float(s.pop_timer):
		var cap := int(s.buildings.hut) * 4
		var space := cap - s.population
		if space > 0:
			s.population += maxi(1, int(space / 2.0))
			s.workers.gatherer = s.population
			s.push_note(Loc.t("a stranger arrives in the night"), "outside")
		s.pop_timer = s.game_time_sec + 60 if cap > s.population else null
	s.phase = s.derive_phase()
	Analytics.tick_checks()
	s.notify_changed()

func _go_home(success: bool) -> void:
	var s := GameState
	for k in s.outfit:
		if int(s.outfit[k]) > 0:
			s.add_item(k, int(s.outfit[k]))
		s.outfit[k] = 0
	if s.flags.get("visited_old_house", false) and success and not s.slice_complete:
		s.slice_complete = true
		Analytics.log_event("slice_complete", {})
	s.world.on_expedition = false
	s.location = "path"
	s.active_event = null
