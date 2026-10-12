extends Control
## Text-forward Chinese UI for the early-game remake.

var loop: GameLoop
var notes: VBoxContainer
var header: HBoxContainer
var body: VBoxContainer
var stores: VBoxContainer
var font: FontFile
var cjk_font: FontFile

func _ready() -> void:
	font = FontFile.new()
	if font.load_dynamic_font("res://fonts/JetBrainsMono-Regular.ttf") != OK:
		push_warning("JetBrains Mono missing")
	cjk_font = FontFile.new()
	if cjk_font.load_dynamic_font("res://fonts/NotoSansSC-Regular-subset.otf") != OK:
		push_warning("Noto Sans SC subset missing")
	else:
		font.fallbacks = [cjk_font]
	theme = Theme.new()
	theme.default_font = font
	theme.default_font_size = 16
	_build()
	loop = GameLoop.new()
	add_child(loop)
	GameState.changed.connect(_render)
	_render()

func _process(delta: float) -> void:
	if loop:
		loop.tick(delta)

func _build() -> void:
	set_anchors_preset(PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color("f3f1ea")
	bg.set_anchors_preset(PRESET_FULL_RECT)
	add_child(bg)
	var root := HBoxContainer.new()
	root.set_anchors_preset(PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 24)
	root.offset_left = 24
	root.offset_top = 20
	root.offset_right = -24
	root.offset_bottom = -20
	add_child(root)
	notes = VBoxContainer.new()
	notes.custom_minimum_size = Vector2(220, 0)
	root.add_child(notes)
	var mid := VBoxContainer.new()
	mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.add_child(mid)
	header = HBoxContainer.new()
	mid.add_child(header)
	body = VBoxContainer.new()
	body.add_theme_constant_override("separation", 8)
	mid.add_child(body)
	stores = VBoxContainer.new()
	stores.custom_minimum_size = Vector2(180, 0)
	root.add_child(stores)
	var menu := HBoxContainer.new()
	menu.set_anchors_preset(PRESET_BOTTOM_LEFT)
	menu.offset_left = 16
	menu.offset_top = -36
	menu.offset_bottom = -8
	add_child(menu)
	menu.add_child(_link("加速.", func(): GameState.time_scale = 2.0 if GameState.time_scale < 2.0 else 1.0))
	menu.add_child(_link("导出遥测.", _export))
	menu.add_child(_link("重开.", func(): loop.act("restart")))

func _link(text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.flat = true
	b.pressed.connect(cb)
	_wire_btn(b, text)
	return b

func _btn(text: String, cb: Callable, disabled: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.disabled = disabled
	b.custom_minimum_size = Vector2(140, 32)
	b.pressed.connect(cb)
	_wire_btn(b, text)
	return b

func _wire_btn(b: Button, id: String) -> void:
	var entered := [0.0]
	b.mouse_entered.connect(func():
		entered[0] = Time.get_ticks_msec() / 1000.0
		Analytics.log_event("button_hover_enter", { "element_id": id, "label": b.text })
	)
	b.mouse_exited.connect(func():
		var dur := Time.get_ticks_msec() / 1000.0 - entered[0]
		Analytics.log_event("button_hover_exit", { "element_id": id, "label": b.text, "duration_ms": int(dur * 1000.0) })
	)
	b.pressed.connect(func():
		var vp := get_viewport().get_visible_rect().size
		var p := get_viewport().get_mouse_position()
		Analytics.log_event("click_heat", {
			"x": p.x, "y": p.y,
			"nx": snapped(p.x / max(vp.x, 1.0), 0.0001),
			"ny": snapped(p.y / max(vp.y, 1.0), 0.0001),
			"element_id": id, "label": b.text
		})
	)

func _label(text: String, size: int = 16) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color("111111"))
	return l

func _render() -> void:
	_clear(notes)
	_clear(header)
	_clear(body)
	_clear(stores)
	for n in GameState.notifications.slice(0, 14):
		var l := _label(str(n.text), 14)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		notes.add_child(l)
	header.add_child(_btn(_room_title(), func(): loop.act("travel", { "area": "room" }), false))
	header.add_child(_btn(_out_title(), func(): loop.act("travel", { "area": "outside" }), not GameState.unlocked.outside))
	header.add_child(_btn(Loc.t("A Dusty Path"), func(): loop.act("travel", { "area": "path" }), not GameState.unlocked.path))
	if GameState.location == "room":
		body.add_child(_label(_room_title(), 22))
		body.add_child(_label("房间" + ["寒冷刺骨", "很冷", "很宜人", "暖和", "很热"][GameState.temperature]))
		body.add_child(_label("火堆" + ["熄灭了", "开始冒烟", "冒出火苗", "燃烧着", "熊熊燃烧"][GameState.fire]))
		var fire_lbl := "生火" if GameState.fire <= 0 else "添柴"
		body.add_child(_btn(fire_lbl, func(): loop.act("stoke_fire" if GameState.fire > 0 else "light_fire"), GameState.cooldowns.get("stoke", 0.0) > 0.0))
		if GameState.builder_level >= 4:
			body.add_child(_btn("陷阱", func(): loop.act("build", { "kind": "trap" })))
			body.add_child(_btn("货车", func(): loop.act("build", { "kind": "cart" })))
			body.add_child(_btn("小屋", func(): loop.act("build", { "kind": "hut" })))
	elif GameState.location == "outside":
		body.add_child(_label(_out_title(), 22))
		body.add_child(_btn("伐木", func(): loop.act("gather_wood"), GameState.cooldowns.get("gather", 0.0) > 0.0))
		if int(GameState.buildings.trap) > 0:
			body.add_child(_btn("查看陷阱", func(): loop.act("check_traps"), GameState.cooldowns.get("traps", 0.0) > 0.0))
	else:
		body.add_child(_label(Loc.t("A Dusty Path"), 22))
		body.add_child(_label(Loc.t("the compass points east")))
		body.add_child(_btn("出发", func(): loop.act("embark"), int(GameState.outfit.get("meat", 0)) + int(GameState.stores.meat) <= 0))
		if GameState.world.get("on_expedition", false):
			body.add_child(_label("荒芜世界"))
			body.add_child(_btn("北", func(): loop.act("world_move", { "dx": 0, "dy": -1 })))
			body.add_child(_btn("南", func(): loop.act("world_move", { "dx": 0, "dy": 1 })))
			body.add_child(_btn("西", func(): loop.act("world_move", { "dx": -1, "dy": 0 })))
			body.add_child(_btn("东", func(): loop.act("world_move", { "dx": 1, "dy": 0 })))
	stores.add_child(_label("库存"))
	if GameState.wood_initialized or int(GameState.stores.wood) > 0:
		stores.add_child(_label("木头  %d" % int(GameState.stores.wood)))
	for k in ["fur", "meat", "scales", "teeth", "cloth", "bait", "compass"]:
		if int(GameState.stores.get(k, 0)) > 0:
			stores.add_child(_label("%s  %d" % [k, int(GameState.stores[k])]))
	if GameState.active_event != null:
		var spec: Dictionary = GameState.active_event.spec
		body.add_child(_label(str(spec.get("title", "消息")), 18))
		body.add_child(_btn("继续", func(): loop.act("event_choice", { "button": "ok" })))

func _room_title() -> String:
	return Loc.t("A Firelit Room") if GameState.fire >= 2 else Loc.t("A Dark Room")

func _out_title() -> String:
	var n := int(GameState.buildings.hut)
	if n <= 0:
		return Loc.t("A Silent Forest")
	if n == 1:
		return Loc.t("A Lonely Hut")
	return Loc.t("A Tiny Village")

func _clear(node: Node) -> void:
	for c in node.get_children():
		c.queue_free()

func _export() -> void:
	var path := "user://telemetry-export.json"
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(Analytics.export_json())
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js := Engine.get_singleton("JavaScriptBridge")
		js.eval("void(function(t){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'application/json'}));a.download='adr-telemetry.json';a.click()}(%s))" % JSON.stringify(Analytics.export_json()))
