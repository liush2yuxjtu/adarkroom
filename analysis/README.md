# 试玩分析

遥测默认写在浏览器 `localStorage`（键 `adr.telemetry`），也可在游戏里点「导出遥测」下载 JSON。可选 HTTP POST 到任意端点；若指向 Supabase REST，使用本目录上一级的 `supabase/migrations/001_playtest_events.sql`。

游戏**构建不需要** Supabase 密钥。只有在设置里填写了 `analytics_endpoint` 才会外发。

## 事件名

| event_name | 含义 |
|------------|------|
| `session_start` / `session_end` | 会话起止 |
| `player_action` | 每次玩家操作（生火、伐木、建造、移动…） |
| `director_think` | 导演一次决策 |
| `director_tool` | 单条工具调用及 `ok` / `rejected` / `error` |
| `resource_snapshot` | 定期库存快照 |
| `phase_time` | 离开某阶段时的停留秒数 |
| `death` | 远征死亡 |
| `quit` | 玩家退出/关闭页 |
| `stuck` | N 分钟无进度（无新旗标、无资源增长、无解锁） |
| `slice_complete` | 走到旧房子并回家（本切片目标） |

## 对接 Supabase

1. 跑 migration。
2. 在游戏设置填写：

```
https://<project>.supabase.co/rest/v1/playtest_events
```

并加上请求头（只存在本机 localStorage，不要提交）：

```
apikey: <anon key>
Authorization: Bearer <anon key>
Content-Type: application/json
Prefer: return=minimal
```

适配器会把每条事件 POST 成：

```json
{
  "session_id": "...",
  "event_name": "player_action",
  "occurred_at": "2026-10-12T02:00:00.000Z",
  "game_time_sec": 42,
  "phase": "forest",
  "payload": { "action": "gather_wood", "wood": 14 },
  "user_agent": "..."
}
```

## 示例 SQL

### 卡在哪（stuck 次数最多的阶段）

```sql
select
  payload->>'phase' as phase,
  count(*) as stuck_events,
  count(distinct session_id) as sessions
from playtest_events
where event_name = 'stuck'
group by 1
order by stuck_events desc;
```

### 漏斗 / 流失（各阶段到达率）

```sql
with phases as (
  select unnest(array[
    'room_dark','room_fire','stranger','forest','village','path','world','slice_complete'
  ]) as phase
),
reached as (
  select session_id, phase
  from playtest_events
  where event_name in ('phase_time', 'session_start', 'slice_complete')
     or payload ? 'phase'
  group by 1, 2
)
select
  p.phase,
  count(distinct r.session_id) as sessions_reached
from phases p
left join reached r on r.phase = p.phase
group by p.phase
order by array_position(array[
  'room_dark','room_fire','stranger','forest','village','path','world','slice_complete'
], p.phase);
```

更干净的做法：用首次进入阶段的 `phase_time` / `player_action`：

```sql
select
  phase,
  count(distinct session_id) as sessions
from playtest_events
where phase is not null
group by phase
order by min(occurred_at);
```

### 过快冲关（游戏时长短于 8 分钟就 slice_complete）

```sql
select
  session_id,
  game_time_sec,
  occurred_at
from playtest_events
where event_name = 'slice_complete'
  and game_time_sec < 8 * 60
order by game_time_sec;
```

### 各阶段停留（中位数）

```sql
select
  payload->>'phase' as phase,
  percentile_cont(0.5) within group (order by (payload->>'seconds')::float) as median_sec,
  avg((payload->>'seconds')::float) as avg_sec,
  count(*) as samples
from playtest_events
where event_name = 'phase_time'
group by 1
order by avg_sec desc;
```

### 导演工具失败率

```sql
select
  payload->>'tool' as tool,
  payload->>'result' as result,
  count(*)
from playtest_events
where event_name = 'director_tool'
group by 1, 2
order by count(*) desc;
```

### 最后操作后退出（疑似流失点）

```sql
with last_action as (
  select distinct on (session_id)
    session_id,
    phase,
    payload->>'action' as action,
    occurred_at
  from playtest_events
  where event_name = 'player_action'
  order by session_id, occurred_at desc
)
select action, phase, count(*) as quits
from last_action
where session_id in (
  select session_id from playtest_events where event_name in ('quit', 'session_end')
)
group by 1, 2
order by quits desc;
```
