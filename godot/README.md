# 小黑屋（Godot 4 重制）

A Dark Room 早期循环的简体中文重制。原作 © Michael Townsend / doublespeak games，MPL-2.0。请保留许可证与署名。

- 打开 `project.godot`（Godot 4.4，Compatibility 渲染）。
- 可玩的 HTML5 运行时在 `build/web/`（无线程，不强制依赖 SharedArrayBuffer）。
- 字体：Noto Serif SC Medium（SIL OFL 1.1），见 `fonts/README.md`。
- 进度存档：`localStorage['adr.save.v1']`（Godot 同时写 `user://adr-save-v1.json`）。刷新会读档；`?fresh=1` 开新档；`?restore=<session_id>` 从本机 `adr.telemetry` 重建；`?import=<base64>` 导入快照。重开会清档。
- 有官方导出模板时：`./export.sh`。
- 叙事工具协议：`docs/TOOLS.md`。
- 无头规则导演试玩：`node tools/simulate.mjs`。
