# Allowlist

File: `tools/verify/migration-allowlist.json`.

```json
{
  "policy": "Nothing is an intentional cut. … Early-game slow pacing is intentional …",
  "entries": []
}
```

Each entry, if any, must have:

- `id` — the extractor row id (`category:original name`)
- `reason` — why the remake may differ, in one sentence

An entry without `reason` makes the machine throw. Do not use the allowlist for "we will do this later"; that is a remaining batch gap, not an accepted deviation.
