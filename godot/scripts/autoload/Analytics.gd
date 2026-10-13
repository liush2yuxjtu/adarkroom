extends Node
## Pluggable telemetry: in-memory + batched HTTP (Supabase REST). Never blocks the game loop.

var buffer: Array = []
var http_endpoint: String = ""
var http_enabled: bool = false
var extra_headers: Dictionary = {}
# @pacing kind=interval id=stuck value=3min
var stuck_minutes: float = 3.0
# @pacing kind=interval id=resource_snapshot value=15s
var snapshot_every: float = 15.0
var last_progress: Dictionary = { "stores": 0, "flags": 0, "unlocks": 0, "at": 0.0 }
var phase_entered: float = 0.0
var current_phase: String = "room_dark"
var last_snapshot: float = 0.0
var last_change_snap: float = -10.0
var last_store_sig: String = ""
var recent_actions: Array = []
var pending_http: Array = []
var session_cap: int = 2500
var dropped: int = 0
var last_action: Dictionary = {}
var active_play_sec: float = 0.0
var focused: bool = true
var last_vis_name: String = ""
var last_vis_at: float = -1.0
var _http: HTTPRequest
var _flush_acc: float = 0.0
var _persist_dirty: bool = false

func _ready() -> void:
	_http = HTTPRequest.new()
	# @pacing-ignore note=telemetry HTTP timeout
	_http.timeout = 8.0
	add_child(_http)
	_load()
	if OS.has_feature("web"):
		_js_eval("window.ADRTelemetry&&window.ADRTelemetry.attachSink&&window.ADRTelemetry.attachSink()")

func _process(delta: float) -> void:
	if focused:
		active_play_sec += delta
	_flush_acc += delta
	# @pacing-ignore note=telemetry batch flush
	if _flush_acc >= 3.0:
		_flush_acc = 0.0
		_flush_http()
		if _persist_dirty:
			_persist()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		_focus_event(false, "godot_focus")
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_WM_WINDOW_FOCUS_IN:
		_focus_event(true, "godot_focus")

func configure(cfg: Dictionary) -> void:
	http_endpoint = str(cfg.get("analytics_endpoint", ""))
	http_enabled = bool(cfg.get("analytics_http_enabled", false))
	# @pacing kind=interval id=stuck value=3min
	stuck_minutes = float(cfg.get("stuck_minutes", 3))
	# @pacing kind=interval id=resource_snapshot value=15s
	snapshot_every = float(cfg.get("snapshot_interval_sec", 15))
	extra_headers = cfg.get("analytics_headers", {})

func debug_enabled() -> bool:
	if bool(GameState.config.get("telemetry_debug", false)):
		return true
	if OS.has_feature("web"):
		var flag: Variant = null
		if Engine.has_singleton("JavaScriptBridge"):
			var js := Engine.get_singleton("JavaScriptBridge")
			flag = js.eval("!!(window.ADRTelemetry&&ADRTelemetry.debugEnabled&&ADRTelemetry.debugEnabled())")
		return bool(flag)
	return false

func log_event(name: String, payload: Dictionary = {}, level: String = "") -> void:
	if level == "":
		level = "debug" if name == "director_think" else "info"
	if level == "debug" and not debug_enabled():
		return
	if buffer.size() + pending_http.size() >= session_cap and name not in ["page_unload", "page_reload", "js_error", "session_end", "save_corrupt"]:
		dropped += 1
		return
	payload = payload.duplicate()
	if str(payload.get("client_version", "")) == "":
		payload["client_version"] = _client_version()
	if name == "player_action":
		last_action = payload
		recent_actions.append({
			"action": payload.get("action"),
			"args": payload.get("args", {}),
			"at": Time.get_datetime_string_from_system(true, true),
			"game_time_sec": snapped(GameState.game_time_sec, 0.01),
			"phase": GameState.phase
		})
		if recent_actions.size() > 8:
			recent_actions = recent_actions.slice(recent_actions.size() - 8)
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
	_persist_dirty = true
	if OS.has_feature("web"):
		_js_eval("window.ADRTelemetry&&window.ADRTelemetry.logFromGodot(%s,%s)" % [
			JSON.stringify(name), JSON.stringify(JSON.stringify(payload))
		])
		return
	if http_enabled and http_endpoint != "":
		pending_http.append(SupabaseSink.row_from_event(ev))
		if pending_http.size() >= 15:
			_flush_http()

func _client_version() -> String:
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		var v: Variant = js.eval("(self.ADR_TELEMETRY&&ADR_TELEMETRY.client_version)||''")
		if str(v) != "":
			return str(v)
	return "godot-dev"

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
	var sig := "%s|%s|%s|%s|%s" % [
		JSON.stringify(GameState.stores), JSON.stringify(GameState.buildings),
		str(GameState.fire), str(GameState.population), str(GameState.temperature)
	]
	if sig != last_store_sig and GameState.game_time_sec - last_change_snap >= 2.0:
		last_store_sig = sig
		last_change_snap = GameState.game_time_sec
		last_snapshot = GameState.game_time_sec
		_snapshot("change")
	elif GameState.game_time_sec - last_snapshot >= snapshot_every:
		last_snapshot = GameState.game_time_sec
		last_store_sig = sig
		_snapshot("interval")

func _snapshot(reason: String) -> void:
	log_event("resource_snapshot", {
		"stores": GameState.stores.duplicate(),
		"buildings": GameState.buildings.duplicate(),
		"fire": GameState.fire,
		"population": GameState.population,
		"temperature": GameState.temperature,
		"reason": reason
	})

func _focus_event(now_focused: bool, source: String) -> void:
	var now := Time.get_ticks_msec() / 1000.0
	var name := "tab_visible" if now_focused else "tab_hidden"
	if last_vis_name == name and now - last_vis_at < 0.5:
		return
	last_vis_name = name
	last_vis_at = now
	focused = now_focused
	if now_focused:
		log_event("tab_visible", { "source": source, "active_play_ms": int(active_play_sec * 1000.0) })
	else:
		log_event("tab_hidden", { "source": source, "active_play_ms": int(active_play_sec * 1000.0) })

func log_audio(name: String, opts: Dictionary = {}) -> void:
	log_event("audio_play", {
		"name": name,
		"src": opts.get("src", "godot"),
		"freq": opts.get("freq", 0),
		"duration_ms": opts.get("duration_ms", 60)
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
	_persist_dirty = false
	var f := FileAccess.open("user://telemetry.json", FileAccess.WRITE)
	if f:
		f.store_string(export_json())

func _load() -> void:
	if FileAccess.file_exists("user://telemetry.json"):
		var f := FileAccess.open("user://telemetry.json", FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_ARRAY:
			buffer = parsed

func _flush_http() -> void:
	if pending_http.is_empty() or http_endpoint == "":
		return
	if _http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	var rows: Array = pending_http.duplicate()
	pending_http.clear()
	var headers := PackedStringArray(["Content-Type: application/json"])
	for k in extra_headers:
		headers.append("%s: %s" % [k, extra_headers[k]])
	var err := _http.request(http_endpoint, headers, HTTPClient.METHOD_POST, JSON.stringify(rows))
	if err != OK:
		for r in rows:
			pending_http.append(r)

func _js_eval(code: String) -> void:
	if not OS.has_feature("web"):
		return
	if Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		js.eval(code)
