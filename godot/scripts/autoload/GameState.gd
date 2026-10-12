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
var income_acc: Dictionary = { "builder": 0.0, "gatherer": 0.0 }
var pop_timer: Variant = null
var time_scale: float = 1.0
var events_catalog: Dictionary = {}
var config: Dictionary = {}

signal changed

func _ready() -> void:
	reset()
	_load_jsons()

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

func _uuid() -> String:
	return "%02x%02x%02x%02x-%02x%02x-4%03x-a%03x-%02x%02x%02x%02x%02x%02x" % [
		randi() % 256, randi() % 256, randi() % 256, randi() % 256,
		randi() % 256, randi() % 256, randi() % 4096, randi() % 4096,
		randi() % 256, randi() % 256, randi() % 256, randi() % 256, randi() % 256, randi() % 256
	]
