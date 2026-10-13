extends Node
## Canonical session state. Directors never mutate this directly.

const ITEMS := ["wood", "fur", "meat", "scales", "teeth", "cloth", "bait", "charm", "compass", "cured_meat"]
const AREAS := ["room", "outside", "path", "world"]

var session_id: String = ""
var game_time_sec: float = 0.0
var fire: int = 0
var temperature: int = 0
var builder_level: int = -1
var npc_moods: Dictionary = { "builder": "unknown", "nomad": "neutral", "villagers": "neutral" }
var stores: Dictionary = {}
var wood_initialized: bool = false
var buildings: Dictionary = { "trap": 0, "cart": 0, "hut": 0 }
var population: int = 0
var workers: Dictionary = { "gatherer": 0 }
var unlocked: Dictionary = { "room": true, "outside": false, "path": false, "world": false }
var location: String = "room"
var phase: String = "room_dark"
var flags: Dictionary = {}
var notifications: Array = []
var cooldowns: Dictionary = {}
var scheduled: Array = []
var active_event: Variant = null
var combat: Variant = null
var outfit: Dictionary = { "meat": 0, "cured_meat": 0 }
var world: Dictionary = {}
var slice_complete: bool = false
var goal: Dictionary = {}
var income_acc: Dictionary = { "builder": 0.0, "gatherer": 0.0 }
var pop_timer: Variant = null
# @pacing kind=interval id=time_scale value=1 phase=room_dark note=default 1x
var time_scale: float = 1.0
var events_catalog: Dictionary = {}
var config: Dictionary = {}

signal changed

const SAVE_PATH := "user://adr-save-v1.json"
const SAVE_LS_KEY := "adr.save.v1"
const SAVE_VERSION := 1

func _ready() -> void:
	reset()
	_load_jsons()
	if not _boot_fresh():
		try_load()

func _boot_fresh() -> bool:
	if not OS.has_feature("web") or not Engine.has_singleton("JavaScriptBridge"):
		return false
	var js := Engine.get_singleton("JavaScriptBridge")
	var flag: Variant = js.eval("(()=>{try{var q=new URLSearchParams(location.search);return q.get('fresh')==='1'}catch(e){return false}})()")
	return bool(flag)

func _load_jsons() -> void:
	if FileAccess.file_exists("res://data/events.json"):
		var f := FileAccess.open("res://data/events.json", FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_DICTIONARY:
			events_catalog = parsed
	if FileAccess.file_exists("res://data/config.json"):
		var c := FileAccess.open("res://data/config.json", FileAccess.READ)
		var parsed2: Variant = JSON.parse_string(c.get_as_text())
		if typeof(parsed2) == TYPE_DICTIONARY:
			config = parsed2
			# @pacing kind=interval id=time_scale value=1 phase=room_dark
			time_scale = float(config.get("time_scale", 1))

func reset() -> void:
	session_id = _uuid()
	game_time_sec = 0.0
	fire = 0
	temperature = 0
	builder_level = -1
	npc_moods = { "builder": "unknown", "nomad": "neutral", "villagers": "neutral" }
	stores = {}
	for k in ITEMS:
		stores[k] = 0
	wood_initialized = false
	buildings = { "trap": 0, "cart": 0, "hut": 0 }
	population = 0
	workers = { "gatherer": 0 }
	unlocked = { "room": true, "outside": false, "path": false, "world": false }
	location = "room"
	phase = "room_dark"
	flags = {}
	notifications = []
	cooldowns = {}
	scheduled = []
	active_event = null
	combat = null
	outfit = { "meat": 0, "cured_meat": 0 }
	world = {
		"on_expedition": false, "size": 11, "x": 5, "y": 5,
		"water": 10, "hp": 10, "max_hp": 10, "food_moves": 0,
		"visited": {}, "landmarks": { "8,3": "old_house" }, "seen_danger": false
	}
	slice_complete = false
	goal = {}
	income_acc = { "builder": 0.0, "gatherer": 0.0 }
	pop_timer = null

func add_item(item: String, amount: int) -> void:
	if not ITEMS.has(item):
		return
	if item == "wood":
		wood_initialized = true
	stores[item] = max(0, int(stores.get(item, 0)) + amount)

func push_note(text: String, source: String = "") -> void:
	if text.is_empty():
		return
	var line := text
	if not line.ends_with("。") and not line.ends_with(".") and not line.ends_with("！"):
		line += "。"
	notifications.push_front({ "text": line, "source": source if source else location, "at": game_time_sec })
	if notifications.size() > 40:
		notifications.resize(40)

func derive_phase() -> String:
	if slice_complete:
		return "slice_complete"
	if world.get("on_expedition", false):
		return "world"
	if unlocked.get("path", false):
		return "path"
	if int(buildings.get("hut", 0)) > 0:
		return "village"
	if unlocked.get("outside", false):
		return "forest"
	if builder_level >= 1:
		return "stranger"
	if fire > 0:
		return "room_fire"
	return "room_dark"

func director_payload() -> Dictionary:
	return {
		"fire": fire,
		"temperature": temperature,
		"builder_level": builder_level,
		"npc_moods": npc_moods.duplicate(),
		"stores": stores.duplicate(),
		"buildings": buildings.duplicate(),
		"population": population,
		"unlocked": unlocked.duplicate(),
		"phase": phase,
		"location": location,
		"flags": flags.duplicate(),
		"world": { "on_expedition": world.get("on_expedition", false), "x": world.get("x", 5), "y": world.get("y", 5) },
		"game_time_sec": snapped(game_time_sec, 0.1)
	}

func notify_changed() -> void:
	phase = derive_phase()
	changed.emit()

func serialize() -> Dictionary:
	return {
		"session_id": session_id,
		"game_time_sec": game_time_sec,
		"fire": fire,
		"temperature": temperature,
		"builder_level": builder_level,
		"npc_moods": npc_moods.duplicate(),
		"stores": stores.duplicate(),
		"wood_initialized": wood_initialized,
		"buildings": buildings.duplicate(),
		"population": population,
		"workers": workers.duplicate(),
		"unlocked": unlocked.duplicate(),
		"location": location,
		"phase": phase,
		"flags": flags.duplicate(),
		"notifications": notifications.duplicate(true),
		"cooldowns": cooldowns.duplicate(),
		"scheduled": scheduled.duplicate(true),
		"active_event": active_event,
		"combat": combat,
		"outfit": outfit.duplicate(),
		"world": world.duplicate(true),
		"slice_complete": slice_complete,
		"income_acc": income_acc.duplicate(),
		"pop_timer": pop_timer
	}

func apply_save(saved: Dictionary) -> void:
	if saved.is_empty():
		return
	session_id = str(saved.get("session_id", session_id))
	game_time_sec = float(saved.get("game_time_sec", game_time_sec))
	fire = int(saved.get("fire", fire))
	temperature = int(saved.get("temperature", temperature))
	builder_level = int(saved.get("builder_level", builder_level))
	if typeof(saved.get("npc_moods")) == TYPE_DICTIONARY:
		npc_moods.merge(saved.npc_moods, true)
	if typeof(saved.get("stores")) == TYPE_DICTIONARY:
		stores.merge(saved.stores, true)
	wood_initialized = bool(saved.get("wood_initialized", wood_initialized))
	if typeof(saved.get("buildings")) == TYPE_DICTIONARY:
		buildings.merge(saved.buildings, true)
	population = int(saved.get("population", population))
	if typeof(saved.get("workers")) == TYPE_DICTIONARY:
		workers.merge(saved.workers, true)
	if typeof(saved.get("unlocked")) == TYPE_DICTIONARY:
		unlocked.merge(saved.unlocked, true)
	location = str(saved.get("location", location))
	if typeof(saved.get("flags")) == TYPE_DICTIONARY:
		flags = saved.flags.duplicate()
	if typeof(saved.get("notifications")) == TYPE_ARRAY:
		notifications = saved.notifications.duplicate()
	if typeof(saved.get("cooldowns")) == TYPE_DICTIONARY:
		cooldowns = saved.cooldowns.duplicate()
	if typeof(saved.get("scheduled")) == TYPE_ARRAY:
		scheduled = saved.scheduled.duplicate()
	active_event = saved.get("active_event", active_event)
	combat = saved.get("combat", combat)
	if typeof(saved.get("outfit")) == TYPE_DICTIONARY:
		outfit.merge(saved.outfit, true)
	if typeof(saved.get("world")) == TYPE_DICTIONARY:
		world.merge(saved.world, true)
	slice_complete = bool(saved.get("slice_complete", slice_complete))
	if typeof(saved.get("income_acc")) == TYPE_DICTIONARY:
		income_acc.merge(saved.income_acc, true)
	pop_timer = saved.get("pop_timer", pop_timer)
	phase = derive_phase()

func save_game() -> void:
	var doc := {
		"v": SAVE_VERSION,
		"saved_at": Time.get_datetime_string_from_system(true),
		"state": serialize()
	}
	var text := JSON.stringify(doc)
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(text)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		js.eval("try{localStorage.setItem('%s', %s)}catch(e){}" % [SAVE_LS_KEY, JSON.stringify(text)])

func try_load() -> bool:
	var parsed: Variant = null
	if FileAccess.file_exists(SAVE_PATH):
		var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
		if f:
			parsed = JSON.parse_string(f.get_as_text())
	if parsed == null and OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		var raw: Variant = js.eval("try{localStorage.getItem('%s')}catch(e){null}" % SAVE_LS_KEY)
		if typeof(raw) == TYPE_STRING and str(raw) != "":
			parsed = JSON.parse_string(str(raw))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	if int(parsed.get("v", 0)) != SAVE_VERSION:
		return false
	var st: Variant = parsed.get("state", {})
	if typeof(st) != TYPE_DICTIONARY:
		return false
	apply_save(st)
	return true

func clear_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(SAVE_PATH)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		js.eval("try{localStorage.removeItem('%s')}catch(e){}" % SAVE_LS_KEY)

func _uuid() -> String:
	return "%02x%02x%02x%02x-%02x%02x-4%03x-a%03x-%02x%02x%02x%02x%02x%02x" % [
		randi() % 256, randi() % 256, randi() % 256, randi() % 256,
		randi() % 256, randi() % 256, randi() % 4096, randi() % 4096,
		randi() % 256, randi() % 256, randi() % 256, randi() % 256, randi() % 256, randi() % 256
	]
