extends RefCounted
class_name LLMDirector
## HTTP director stub. POSTs state + tool list; executes validated calls.

var _http: HTTPRequest
var busy: bool = false

func setup(host: Node) -> void:
	_http = HTTPRequest.new()
	_http.timeout = 8.0
	host.add_child(_http)
	_http.request_completed.connect(_on_done)

func think() -> void:
	var endpoint := str(GameState.config.get("llm_endpoint", ""))
	if endpoint == "" or busy:
		return
	busy = true
	Analytics.log_event("director_think", { "director": "llm" })
	var body := {
		"session_id": GameState.session_id,
		"game_time_sec": GameState.game_time_sec,
		"state": GameState.director_payload(),
		"tools": ToolExecutor.schema(),
		"allowed_tools": ToolExecutor.TOOL_NAMES
	}
	var headers := PackedStringArray(["Content-Type: application/json"])
	var key := str(GameState.config.get("llm_api_key", ""))
	if key != "":
		headers.append("Authorization: Bearer %s" % key)
	var err := _http.request(endpoint, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		busy = false
		Analytics.log_event("director_error", { "message": "request failed to start" })

func _on_done(_result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	busy = false
	if code < 200 or code >= 300:
		Analytics.log_event("director_error", { "message": "http %d" % code })
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("calls"):
		Analytics.log_event("director_error", { "message": "invalid json" })
		return
	ToolExecutor.apply_calls(parsed.calls, "llm")
