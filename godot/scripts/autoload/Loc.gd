extends Node
## Chinese strings reused from lang/zh_cn/strings.js (original ADR).

var _map: Dictionary = {}

func _ready() -> void:
	var path := "res://data/strings_zh.json"
	if FileAccess.file_exists(path):
		var f := FileAccess.open(path, FileAccess.READ)
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_DICTIONARY:
			_map = parsed

func t(key: String) -> String:
	if _map.has(key):
		return str(_map[key])
	return key
