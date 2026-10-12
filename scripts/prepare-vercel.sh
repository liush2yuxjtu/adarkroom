#!/usr/bin/env bash
# Assemble the static site: remake at / and the original JS game at /classic/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST" "$DIST/classic"

cp -a "$ROOT/godot/build/web/." "$DIST/"
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

echo "Prepared $DIST"
