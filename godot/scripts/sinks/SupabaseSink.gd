extends RefCounted
class_name SupabaseSink
## Optional REST adapter. No secrets are baked into the build.
## Point analytics_endpoint at:
##   https://<project>.supabase.co/rest/v1/playtest_events
## Headers (runtime only):
##   apikey: <anon key>
##   Authorization: Bearer <anon key>
##   Prefer: return=minimal
##   Content-Type: application/json

static func headers_from_anon_key(anon_key: String) -> Dictionary:
	return {
		"apikey": anon_key,
		"Authorization": "Bearer %s" % anon_key,
		"Prefer": "return=minimal",
		"Content-Type": "application/json",
	}

static func row_from_event(ev: Dictionary) -> Dictionary:
	return {
		"session_id": ev.get("session_id", ""),
		"event_name": ev.get("event_name", ""),
		"occurred_at": ev.get("occurred_at", ""),
		"game_time_sec": ev.get("game_time_sec", 0),
		"phase": ev.get("phase", ""),
		"payload": ev.get("payload", {}),
		"user_agent": ev.get("user_agent", "godot"),
	}
