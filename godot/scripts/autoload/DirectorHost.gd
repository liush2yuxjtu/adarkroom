extends Node
## Switches between the rule director and the LLM HTTP stub.

var director_name: String = "rule"
var rule: RuleDirector = RuleDirector.new()
var llm: LLMDirector = LLMDirector.new()
var _acc: float = 0.0

func _ready() -> void:
	director_name = str(GameState.config.get("director", "rule"))
	llm.setup(self)
	Analytics.configure(GameState.config)
	Analytics.log_event("session_start", { "director": director_name })
	_think()

func _process(delta: float) -> void:
	_acc += delta * GameState.time_scale
	# @pacing kind=interval id=director_think value=1s
	if _acc >= 1.0:
		_acc = 0.0
		_think()

func _think() -> void:
	if director_name == "llm" and str(GameState.config.get("llm_endpoint", "")) != "":
		llm.think()
		return
	Analytics.log_event("director_think", { "director": "rule" })
	ToolExecutor.apply_calls(rule.think(), "rule")

func set_director(name: String, endpoint: String = "", api_key: String = "") -> void:
	director_name = "llm" if name == "llm" else "rule"
	GameState.config["director"] = director_name
	if endpoint != "":
		GameState.config["llm_endpoint"] = endpoint
	if api_key != "":
		GameState.config["llm_api_key"] = api_key
