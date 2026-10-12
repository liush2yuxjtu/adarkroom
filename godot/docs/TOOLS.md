# 叙事工具协议

本重制把剧情推进从「写死的触发器」拆成一组**具名工具**。游戏状态机只负责执行工具；由可插拔的 **导演（director）** 根据当前状态决定下一步调用哪些工具。

默认导演是离线可用的规则导演（`rule`）。配置 `director: "llm"` 后，会把状态和本文件中的工具表以 JSON POST 到指定 HTTP 端点，校验后执行返回的工具调用。

## 请求（LLM 导演）

`POST {llm_endpoint}`

```json
{
  "session_id": "uuid",
  "game_time_sec": 120.5,
  "state": { "...": "见下方 GameState 摘要" },
  "tools": [ { "name": "narrate", "params": { "text": "string" } } ],
  "allowed_tools": ["spawn_event", "give_item", "change_npc_mood", "narrate", "unlock_area", "set_flag"]
}
```

`Content-Type: application/json`。可选请求头 `Authorization: Bearer {llm_api_key}`（仅运行时配置，不参与构建）。

## 响应

```json
{
  "calls": [
    {
      "tool": "narrate",
      "args": { "text": "火光映出窗外，投入黑暗之中" },
      "delay_sec": 0
    }
  ]
}
```

- `calls` 必须是数组，最多 8 条。
- 未知工具名、缺参、类型错误、非法物品/区域会被拒绝，并记入遥测 `director_tool_rejected`。
- `delay_sec` 可选，默认 0。延迟调用在游戏时钟上排队（受 `time_scale` 影响）。

## 工具一览

| 工具 | 参数 | 作用 |
|------|------|------|
| `spawn_event` | `event_id` (string), `payload` (object, 可选) | 打开具名事件面板（游牧部落、噪声、旧房子等）。`event_id` 必须存在于 `data/events.json`。 |
| `give_item` | `item` (string), `amount` (number) | 增减库存。`amount` 可为负，结果不会低于 0。合法物品见下。 |
| `change_npc_mood` | `npc` (string), `mood` (string) | 改变 NPC 心情。`npc`: `builder` \| `nomad` \| `villagers`。`mood`: `unknown` \| `collapsed` \| `shivering` \| `sleeping` \| `helping` \| `neutral` \| `wary` \| `grateful`。 |
| `narrate` | `text` (string), `source` (string, 可选) | 向通知栏追加一句叙述。`source` 用于分栏：`room` / `outside` / `path` / `world` / `system`。 |
| `unlock_area` | `area` (string) | 解锁标签页。`area`: `room` \| `outside` \| `path` \| `world`。解锁 `outside` 时若木头尚未入账，规则导演会另发 `give_item`。 |
| `set_flag` | `key` (string), `value` (any) | 写入 `state.flags`。也用于导演推进建造者等级等内部进度（如 `builder_level`）。 |

## 合法物品

`wood`, `fur`, `meat`, `scales`, `teeth`, `cloth`, `bait`, `charm`, `compass`, `cured_meat`

## GameState 摘要（发给导演）

```json
{
  "fire": 0,
  "temperature": 0,
  "builder_level": -1,
  "npc_moods": { "builder": "unknown" },
  "stores": { "wood": 0 },
  "buildings": { "trap": 0, "cart": 0, "hut": 0 },
  "population": 0,
  "unlocked": { "room": true, "outside": false, "path": false, "world": false },
  "phase": "room_dark",
  "location": "room",
  "flags": {},
  "world": { "on_expedition": false, "x": 5, "y": 5 }
}
```

`fire` / `temperature`：0 熄灭/寒冷刺骨 … 4 熊熊燃烧/很热。`builder_level`：-1 未出现，0 已预告，1 倒下，2 发抖，3 睡去，4 帮忙。

## 导演

### 规则导演 `rule`（默认）

确定性规则，复刻原作早期节奏：

1. 火堆 > 冒出火苗 且建造者未出现 → `narrate` 火光外溢，30 秒后 `spawn_event`/`set_flag` 迎来陌生人。
2. 陌生人出现 15 秒后 `unlock_area(outside)` + `give_item(wood, 4)` + 寒风/柴薪将尽。
3. 室温 ≥ 暖和 时每 30 秒推进建造者 1→2→3。
4. 玩家回到房间且等级为 3 → 升到 4，`change_npc_mood(builder, helping)`。
5. 房间内、有毛皮时按 3–6 分钟窗口投 `nomad` / `noises_outside`。
6. 第一座小屋且已有毛皮、尚未有罗盘 → `builder_finds_compass`（保证 15–30 分钟切片能走上尘途；原价游牧罗盘仍可用）。
7. 拥有罗盘 → `unlock_area(path)` / `world`。

同一规则在同一会话只触发一次（用 `flags` 去重）。

### LLM 导演 `llm`

见上。端点无响应、超时（8s）或非法 JSON 时**不会**回退到规则导演，只记录 `director_error`，以免剧情分叉。可在设置里切回 `rule`。

## 切换方式

1. 游戏内「设置」：导演 = 规则 / 语言模型。
2. `godot/data/config.json` 的 `director` 字段。
3. URL：`?director=llm&llm=https://example.com/director`。

密钥不要写进仓库。浏览器端可在设置里填写，只存在 `localStorage`。
