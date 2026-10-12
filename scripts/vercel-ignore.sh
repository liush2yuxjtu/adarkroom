#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = build.
# Auto-deploy only main and cursor/godot-chinese-remake-5c3a.
# Docs/tools-only commits on those branches are also skipped.
set -u

LIVE_BRANCH="cursor/godot-chinese-remake-5c3a"
REF="${VERCEL_GIT_COMMIT_REF:-}"

# Preview-only: this feature branch is allowlisted so one manual git preview can build.
# Strip before merging into main / the live remake branch.
PREVIEW_BRANCH="cursor/art-style-tweak-94b6"

if [[ "$REF" != "main" && "$REF" != "$LIVE_BRANCH" && "$REF" != "$PREVIEW_BRANCH" ]]; then
  echo "vercel-ignore: skip (branch '${REF:-<empty>}' is not an auto-deploy ref)"
  exit 0
fi

if ! git rev-parse -q --verify HEAD^ >/dev/null; then
  echo "vercel-ignore: build (HEAD^ missing; shallow clone or first commit)"
  exit 1
fi

if git diff --quiet HEAD^ HEAD -- . \
  ':(exclude)*.md' \
  ':(exclude)**/*.md' \
  ':(exclude)reports/' \
  ':(exclude)tools/' \
  ':(exclude)agent/skills/' \
  ':(exclude).github/'; then
  echo "vercel-ignore: skip (docs/tools-only commit on ${REF})"
  exit 0
fi

echo "vercel-ignore: build (code or config changed on ${REF})"
exit 1
