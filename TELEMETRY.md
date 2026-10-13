# 遥测说明 / Telemetry

### 存档快照遥测（save_snapshot）——仅用于分析玩家行为

`save-telemetry.js` 会把**脱敏后的** `adr.save.v1` 游戏状态作为 `save_snapshot` 事件，经现有遥测通道写入 Supabase `playtest_events.payload.save_data`（无表结构变更、无迁移）。

- **用途声明：这些数据只用于分析玩家行为（节奏、进度、卡点、流失点），不做任何其他用途**——不做广告、不做画像、不出售、不关联真实身份。
- 触发：点火、建造、阶段推进/解锁、出发探索、探索结束、死亡、结局、late-game 里程碑、读档、存档（最多每 60 秒一次），以及**每 N 分钟定时**（默认 5，可用 `ADR_TELEMETRY.save_snapshot_minutes` 配置）。
- 脱敏：只保留游戏状态；剔除昵称/邮箱/显示名/用户名/UA/设备/IP/token/endpoint 等键，字符串里的邮箱替换为 `[redacted]`，`session_id` 不放进存档体，只在顶层带现有匿名 id（`anon_id`）。
- 体积：存档体上限 12000 字符（RLS 要求 `pg_column_size(payload) < 16384`）；超限依次丢弃 `notifications`/`scheduled`/`active_event`/`goal`，再把 `world.visited` 压成计数，仍超限则截断为核心字段，并在 `truncated`/`dropped` 里标明。
- 退出：`?telemetry=0`、`localStorage.adr.telemetry_optout = "1"` 或 `ADR_TELEMETRY.save_snapshot = false` 均不发送 save_snapshot。

English: `save_snapshot` sends a sanitized copy of the `adr.save.v1` game state (no personal data, anonymous session id only) on milestones and every 5 minutes. It is used ONLY to analyze player behavior and for nothing else. Opt out with `?telemetry=0` or `localStorage["adr.telemetry_optout"]="1"`.
