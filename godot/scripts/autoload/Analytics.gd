extends Node
## Pluggable telemetry: in-memory + user:// JSON + optional HTTP (Supabase REST).

var buffer: Array = []
var http_endpoint: String = ""
var http_enabled: bool = false
var extra_headers: Dictionary = {}
# @pacing kind=interval id=stuck value=3min
var stuck_minutes: float = 3.0
# @pacing kind=interval id=resource_snapshot value=30s
var snapshot_every: float = 30.0
var last_progress: Dictionary = { "stores": 0, "flags": 0, "unlocks": 0, "at": 0.0 }
var phase_entered: float = 0.0
var current_phase: String = "room_dark"
var last_snapshot: float = 0.0
var _http: HTTPRequest

func _ready() -> void:
	_http = HTTPRequest.new()
	add_child(_http)
	_load()

func configure(cfg: Dictionary) -> void:
	http_endpoint = str(cfg.get("analytics_endpoint", ""))
	http_enabled = bool(cfg.get("analytics_http_enabled", false))
	# @pacing kind=interval id=stuck value=3min
	stuck_minutes = float(cfg.get("stuck_minutes", 3))
	# @pacing kind=interval id=resource_snapshot value=30s
	snapshot_every = float(cfg.get("snapshot_interval_sec", 30))
	extra_headers = cfg.get("analytics_headers", {})

func log_event(name: String, payload: Dictionary = {}) -> void:
	var ev := {
		"session_id": GameState.session_id,
		"event_name": name,
		"occurred_at": Time.get_datetime_string_from_system(true, true),
		"game_time_sec": snapped(GameState.game_time_sec, 0.01),
		"phase": GameState.phase,
		"payload": payload,
		"user_agent": "godot"
	}
	buffer.append(ev)
	if buffer.size() > 800:
		buffer = buffer.slice(buffer.size() - 800)
	_persist()
	if http_enabled and http_endpoint != "":
		_post(ev)

func export_json() -> String:
	return JSON.stringify(buffer)

func tick_checks() -> void:
	if GameState.phase != current_phase:
		log_event("phase_time", { "phase": current_phase, "seconds": snapped(GameState.game_time_sec - phase_entered, 0.1) })
		current_phase = GameState.phase
		phase_entered = GameState.game_time_sec
	_mark_progress()
	if GameState.game_time_sec - float(last_progress.at) >= stuck_minutes * 60.0 and GameState.game_time_sec - float(last_progress.at) < stuck_minutes * 60.0 + 1.2:
		log_event("stuck", { "phase": GameState.phase, "idle_sec": stuck_minutes * 60.0 })
	if GameState.game_time_sec - last_snapshot >= snapshot_every:
		last_snapshot = GameState.game_time_sec
		log_event("resource_snapshot", {
			"stores": GameState.stores.duplicate(),
			"buildings": GameState.buildings.duplicate(),
			"fire": GameState.fire,
			"population": GameState.population
		})

func _mark_progress() -> void:
	var store_sum := 0
	for k in GameState.stores:
		store_sum += int(GameState.stores[k])
	var flags := GameState.flags.size()
	var unlocks := 0
	for a in GameState.AREAS:
		if GameState.unlocked.get(a, false):
			unlocks += 1
	if store_sum > int(last_progress.stores) or flags > int(last_progress.flags) or unlocks > int(last_progress.unlocks):
		last_progress = { "stores": store_sum, "flags": flags, "unlocks": unlocks, "at": GameState.game_time_sec }

func _persist() -> void:
	var f := FileAccess.open("user://telemetry.json", FileAccess.WRITE)
	if f:
		f.store_string(export_json())
	if OS.has_feature("web"):
		_js_set("adr.telemetry", export_json())

func _load() -> void:
	if FileAccess.file_exists("user://telemetry.json"):
		var f := FileAccess.open("user://telemetry.json", FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_ARRAY:
			buffer = parsed

func _post(ev: Dictionary) -> void:
	var headers := PackedStringArray(["Content-Type: application/json"])
	for k in extra_headers:
		headers.append("%s: %s" % [k, extra_headers[k]])
	_http.request(http_endpoint, headers, HTTPClient.METHOD_POST, JSON.stringify(ev))

func _js_set(key: String, value: String) -> void:
	if not OS.has_feature("web"):
		return
	# JavaScriptBridge is available on web exports.
	if Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		js.eval("try{localStorage.setItem('%s', %s)}catch(e){}" % [key, JSON.stringify(value)])
