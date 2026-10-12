# 小黑屋（Godot 4 重制）

A Dark Room 早期循环的简体中文重制。原作 © Michael Townsend / doublespeak games，MPL-2.0。请保留许可证与署名。

- 打开 `project.godot`（Godot 4.4，Compatibility 渲染）。
- 可玩的 HTML5 运行时在 `build/web/`（无线程，不强制依赖 SharedArrayBuffer）。
- 字体：Noto Serif SC Medium（SIL OFL 1.1），见 `fonts/README.md`。
- 进度存档：`localStorage['adr.save.v1']`（Godot 同时写 `user://adr-save-v1.json`）。刷新会读档；`?fresh=1` 开新档；`?restore=<session_id>` 从本机 `adr.telemetry` 重建；`?import=<base64>` 导入快照。重开会清档。
- 有官方导出模板时：`./export.sh`。
- 叙事工具协议：`docs/TOOLS.md`。
- 无头规则导演试玩：`node tools/simulate.mjs`。

## 遥测事件目录

可玩站点是 `build/web/`（不是 WASM）。事件写入 `playtest_events.event_name`，细节在 `payload` jsonb。浏览器队列每 **3 秒或 15 条** flush；`pagehide`/`beforeunload` 走 `sendBeacon` 或 `fetch keepalive`。单会话封顶 **2500** 条。

Analytics 有事件等级：`info`（默认，始终上报）和 `debug`。`director_think` 是 **debug**：默认 **不会** 写入 Supabase `playtest_events`，只在控制台 `console.debug`。打开调试后才上报。其它事件（`player_action`、`resource_snapshot`、`phase_time`、`session_start`、`director_tool` 以及下表新事件）都是 `info`，始终发送。

打开 debug 的方式（任一即可）：

- URL：`/?telemetry_debug=1`（`0` 可强制关）
- `localStorage.setItem('adr.telemetry_debug', '1')`（`0` 可关）
- 项目设置：`data/config.json` 的 `telemetry_debug: true`
- 导出/构建环境变量 `TELEMETRY_DEBUG=1`（`scripts/prepare-vercel.sh` 写入 `telemetry-config.js` 的 `ADR_TELEMETRY.debug`）

默认跑一局 **不应** 在 Supabase `playtest_events` 出现 `director_think` 行；加上上述任一开关后再跑，才会写入。关着时 `director_think` 只打 `console.debug('[adr:debug]', ...)`，不进队列、不上报。

`resource_snapshot` 默认 **15s**，资源变化时额外打点（最短间隔 2s）。鼠标轨迹仅在移动时每 **300ms** 采样，满 6 点或停住再发一条。滚动 400ms、可见性 500ms 去重。

| event_name | 触发 | payload 字段 | 采样 |
|---|---|---|---|
| `session_start` | 启动 / 重开 | `director`, `restart?` | 每次 |
| `session_end` | 重开或关闭页 | `reason` | 每次 |
| `player_action` | `Game.act` 成功 | `action`, `args`, `note` | 每次 |
| `director_think` | 导演每秒思考（debug） | `director`, `call_count`, `tools` | 默认不上报；`?telemetry_debug=1` 时每秒 |
| `director_tool` | 单条工具执行 | `tool`, `args`, `result`, `error`, `origin` | 每次 |
| `resource_snapshot` | 定时或库存变化 | `stores`, `buildings`, `fire`, `population`, `temperature`, `reason` | 15s 或变化≥2s |
| `phase_time` | 离开阶段 | `phase`, `seconds` | 每次切换 |
| `stuck` | N 分钟无进度 | `phase`, `idle_sec` | 阈值边沿一次 |
| `death` / `quit` / `slice_complete` | 远征死 / 关页 / 切片完成 | 视事件 | 每次 |
| `tab_hidden` / `tab_visible` | `visibilitychange`、`window` blur/focus、Godot focus | `source`, `active_play_ms`, `last_hidden_ms?` | 500ms 去重 |
| `mouse_trajectory` | 鼠标移动 | `samples[{t,x,y,nx,ny}]`, `reason`, `n` | 300ms，仅移动 |
| `button_hover_enter` / `button_hover_exit` | 按钮悬停 | `element_id`, `label`, `duration_ms?` | 进入/离开 |
| `click_heat` | 点击 | `x`, `y`, `nx`, `ny`, `element_id`, `tag`, `label` | 每次点击 |
| `scroll` | 窗口或通知栏滚动 | `source`, `scroll_x/y`, `scroll_max_x/y`, `target_scroll_top` | 400ms |
| `npc_interact` | `change_npc_mood` | `npc`, `mood`, `origin`, `moods` | 每次 |
| `dialogue` | `narrate` / `spawn_event` | `tool`, `event_id`, `text`, `origin` | 每次 |
| `dialogue_choice` | 事件选项 | `event_id`, `scene`, `button` | 每次 |
| `unlock` | `unlock_area` | `area`, `origin`, `unlocked` | 每次 |
| `build` | 建造成功 | `kind`, `cost`, `have`, `buildings`, `path` | 每次 |
| `js_error` | `onerror` / `unhandledrejection` | `type`, `message`, `source`, `line`, `col`, `stack` | 每会话最多 20 |
| `load_performance` | 首帧 | `nav_type`, `dns_ms`, `connect_ms`, `ttfb_ms`, `dom_content_loaded_ms`, `load_event_ms`, `time_to_first_frame_ms`, `wasm_ms`, `pck_ms`, `runtime`, `scripts` | 每页一次 |
| `audio_play` | 短音效（生火/伐木/建造等） | `name`, `src`, `freq`, `duration_ms`, `context_state` | 每次播放 |
| `page_unload` | `pagehide`（`beforeunload` 兜底） | `reason`, `phase`, `stores`, `buildings`, `fire`, `population`, `game_time_sec`, `active_play_ms`, `last_action` | 每页一次 |
| `page_reload` | 下次加载且 `navigation.type==='reload'` | `previous_session_id`, `time_since_unload_ms`, `nav_type`, `previous_phase`, `previous_game_time_sec`, `previous_last_action` | 刷新时 |
| `save_write` | 存档系统写出 | `save_id`, `save_version`, `phase`, `resources`, `play_time_sec`, `write_ms`, `backend`, `size`, `checksum` | 每次写出 |
| `save_load` | 启动/手动读档 | `ok`, `backend` (`localStorage`/`IndexedDB`), `error`, `size`, `save_id`, `save_version` | 每次 |
| `save_corrupt` | 读档完整性失败 | `reason`, `backend`, `error`, `backup_key`, `save_id` | 每次 |
| `new_game_start` | 重开且已有旧档 | `overwritten`, `previous_save_id`, `previous_phase`, `previous_play_time_sec`, `previous_last_action`, `previous_last_save_at`, `recent_actions`, `last_phase` | 每次重开 |

存档埋点挂在现有存档模块上（`save-telemetry.js` 包装 `save`/`load`/`autosave` 以及约定的 storage key），**不另做一套存档**。损坏存档会备份到 `localStorage` 键 `adr.save.corrupt.<ts>`，不把整份档塞进 payload（RLS 限制 `pg_column_size(payload) < 16384`）。

弃档长局（上一局 ≥30 分钟后 `new_game_start`）见视图 `abandoned_long_runs`（`supabase/migrations/002_abandoned_long_runs.sql`）。

### 验证（预览 37c7c0b，`?fast=1`）

| 开关 | session_id | `director_think` 行 | 总行 | 备注 |
|---|---|---|---|---|
| 默认（无 debug） | `cfbc47e3-1e84-433a-ad62-679768f97dcf` | **0** | 92 | 仍有 `player_action` / `director_tool` / `session_start` / `page_unload` / `page_reload` / `save_load` |
| `?telemetry_debug=1` | `5768c975-e0a6-42d4-9b9e-a55f180f0f9e` | **55** | 99 | debug 级这才进 `playtest_events` |

再确认：`af26834e-…` 默认 0 think；`c0bb741e-…` debug 54 think。anon RLS 仍只有 INSERT（`session_id` 1–128、`event_name` 1–64、`payload` < 16KB）。短局 `?fast=1` 墙钟约 6–7s，默认约 820 行/分、debug 约 990 行/分；其中 debug 增量几乎全是每秒一条的 `director_think`。正常 1× 时间、不开 debug 时不再有这 60 行/分。
