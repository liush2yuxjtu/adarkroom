#!/usr/bin/env bash
# Assemble the static site: remake at / and the original JS game at /classic/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST" "$DIST/classic"

cp -a "$ROOT/godot/build/web/." "$DIST/"
if [[ -d "$ROOT/assets/pixel" ]]; then
  mkdir -p "$DIST/assets/pixel"
  cp -a "$ROOT/assets/pixel/." "$DIST/assets/pixel/"
fi
mkdir -p "$DIST/data"
if [[ -d "$ROOT/godot/data" ]]; then
  cp -a "$ROOT/godot/data/." "$DIST/data/"
  mkdir -p "$DIST/godot/data"
  cp -a "$ROOT/godot/data/." "$DIST/godot/data/"
fi

# Original game, intact, under /classic/
cp "$ROOT/index.html" "$DIST/classic/index.html"
for d in script css lib lang img audio; do
  if [[ -d "$ROOT/$d" ]]; then
    cp -a "$ROOT/$d" "$DIST/classic/"
  fi
done
for f in favicon.ico mobileWarning.html browserWarning.html; do
  if [[ -f "$ROOT/$f" ]]; then
    cp "$ROOT/$f" "$DIST/classic/"
  fi
done

# Short git SHA of this deploy. Vercel sets VERCEL_GIT_COMMIT_SHA; local/export falls back to HEAD.
CLIENT_SHA="${VERCEL_GIT_COMMIT_SHA:-}"
if [[ -z "$CLIENT_SHA" ]]; then
  CLIENT_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -n "$CLIENT_SHA" ]]; then
  CLIENT_VERSION="${CLIENT_SHA:0:7}"
else
  CLIENT_VERSION="dev"
fi

# Static site: inject Vercel SUPABASE_* + client_version at build time (empty url = localStorage-only).
python3 - "$DIST/telemetry-config.js" "${SUPABASE_URL:-}" "${SUPABASE_ANON_KEY:-}" "${TELEMETRY_DEBUG:-}" "$CLIENT_VERSION" <<'PY'
import json, sys
dest, raw_url, key, debug_raw, client_version = (
    sys.argv[1], sys.argv[2].strip(), sys.argv[3].strip(), sys.argv[4].strip().lower(), sys.argv[5].strip()
)
url = ""
if raw_url and key:
    # Same-origin path: Vercel rewrites /api/playtest_events → Supabase REST.
    # Avoids CORS preflight (Playwright records those as requestfailed/ERR_ABORTED).
    url = "/api/playtest_events"
debug = debug_raw in ("1", "true", "yes")
if not client_version:
    client_version = "dev"
with open(dest, "w", encoding="utf-8") as f:
    f.write("self.ADR_TELEMETRY = { url: %s, anonKey: %s, debug: %s, client_version: %s };\n" % (
        json.dumps(url), json.dumps(key), "true" if debug else "false", json.dumps(client_version)))
print("Wrote telemetry-config.js (%s, debug=%s, client_version=%s)" % (
    "Supabase REST sink enabled" if url else "localStorage-only; SUPABASE_* unset", debug, client_version))
PY

echo "Prepared $DIST"
