A Dark Room
===========
> "awake. head throbbing. vision blurry. come light the fire."

a minimalist text adventure game for your browser

[Click to play](http://adarkroom.doublespeakgames.com)

<table>
<tr><th colspan=4>Available Languages</tr>
<tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=zh_cn">Chinese (Simplified)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=zh_tw">Chinese (Traditional)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=en">English</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=fr">French</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=de">German</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=el">Greek</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=id">Indonesian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=it">Italian</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ja">Japanese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ko">Korean</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=nb">Norwegian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pl">Polish</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pt">Portuguese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pt_br">Portuguese (Brazil)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ru">Russian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=es">Spanish</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=sv">Swedish</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=th">Thai</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=tr">Turkish</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=uk">Ukrainian</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=vi">Vietnamese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=lt_LT">Lithuanian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=gl">Galician</a></td>
</tr>
</table>

or play the latest on [GitHub](http://doublespeakgames.github.io/adarkroom)

<a href="https://itunes.apple.com/us/app/a-dark-room/id736683061"><img src="http://i.imgur.com/DMdnDYq.png" height="50"></a>
<a href="https://play.google.com/store/apps/details?id=com.yourcompany.adarkroom"><img src="http://i.imgur.com/bLWWj4r.png" height="50"></a>
<a href="https://store.steampowered.com/app/2460660/A_Dark_Room/"><img src="https://i.imgur.com/yz6cnU0.png" height="50"></a>

---

## 小黑屋 Godot 重制（早期循环）

本仓库在保留原版 JS 游戏（MPL-2.0，Michael Townsend / doublespeak games）的前提下，于 `godot/` 增加简体中文重制。部署后重制在 `/`，原版在 `/classic/?lang=zh_cn`。文案复用 `lang/zh_cn/strings.js`。

### 怎么玩

1. 打开站点首页。房间是黑的——点 **生火**，再适时 **添柴**，把屋子烧暖和。
2. 火光外溢后，会有衣衫褴褛的陌生人倒下。保持室温「暖和」以上，她会醒来并答应帮你建东西。
3. 野外解锁后去 **伐木**。建造 **陷阱**、**货车**、**小屋**；查看陷阱收集毛皮与肉，村民会在夜里到来。
4. 第一座小屋立起且有了毛皮后，建造者会摸到一块旧罗盘（游牧部落仍可按原价换罗盘）。**漫漫尘途** 解锁后，带上肉 **出发**，在荒芜世界里走到标着 `H` 的旧房子再回家，即完成本切片。
5. 熟练玩家约 15–30 分钟（可用「加速.」×2）。完整太空结局仍请玩原版。

### 怎么切换导演

剧情不再写死在触发器里，而由导演调用工具（`narrate`、`spawn_event`、`give_item`、`unlock_area`、`set_flag`、`change_npc_mood`）。协议见 [`godot/docs/TOOLS.md`](godot/docs/TOOLS.md)。

- **规则导演（默认，可离线）**：复刻原作早期节奏。
- **语言模型导演**：设置里选「语言模型」，填写 HTTP 端点。游戏会 POST 当前状态 + 工具表，校验后执行返回的 `calls`。也可：

```
/?director=llm&llm=https://example.com/director
```

密钥只存在浏览器 `localStorage`，不要写进仓库。

### 怎么把遥测指到 Supabase

默认写入 `localStorage`（键 `adr.telemetry`），可用「导出遥测.」下载 JSON。

1. 在 Supabase SQL 编辑器执行 [`supabase/migrations/001_playtest_events.sql`](supabase/migrations/001_playtest_events.sql)。
2. 游戏设置里填写：

```
https://<project>.supabase.co/rest/v1/playtest_events
```

并把 anon key 填进「遥测 apikey」。适配器见 `godot/build/web/sinks/supabase.js` 与 `godot/scripts/sinks/SupabaseSink.gd`。Vercel 预览/生产构建会把 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 写入 `telemetry-config.js`。浏览器把事件放进队列，每 3 秒或满 15 条 flush；`pagehide` / `beforeunload` 用 `sendBeacon`（`apikey` 查询参数）或 `fetch keepalive`。单会话上限 2500 条。`director_think` 是 debug 级，默认不进 Supabase（只 `console.debug`）；用 `/?telemetry_debug=1`、`localStorage.adr.telemetry_debug=1`、`data/config.json` 的 `telemetry_debug` 或构建变量 `TELEMETRY_DEBUG=1` 打开。已在预览验证：默认局 `cfbc47e3-…` 的 `playtest_events` 里 **0** 条 `director_think`，`?telemetry_debug=1` 局 `5768c975-…` 有 **55** 条。新增埋点：`this.analytics.log(this.state, "事件名", { 任意字段 })`。完整事件目录、采样率与弃档 SQL 见 [`godot/README.md`](godot/README.md#遥测事件目录) 与 [`analysis/README.md`](analysis/README.md)。

本地预览：`bash scripts/prepare-vercel.sh && npx --yes serve dist`。Godot 编辑器打开 `godot/project.godot`；有导出模板时跑 `godot/export.sh`。
