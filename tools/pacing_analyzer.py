#!/usr/bin/env python3
"""Standalone pacing analyzer for the Chinese A Dark Room remake.

No agent required. Scans @pacing tags, builds an expected curve, compares
playtest_events (Supabase or --input JSON), and writes Markdown/JSON reports.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Grammar
# ---------------------------------------------------------------------------
# Comment tag (JS: // @pacing … ; GDScript: # @pacing …)
#   @pacing kind=<kind> id=<id> value=<value> [phase=<phase>] [min=<dur>] [max=<dur>] [note=<text>]
#
# Required:
#   kind   cooldown | trigger | interval | income | consume | cost | threshold
#   id     stable token (gather, stoke, builder_arrives, …)
#   value  duration with unit s|ms|min, a rate N/s or N/Ts, or a dimensionless amount
#
# Optional: phase, min, max, note
# Ignore a timing literal on purpose: @pacing-ignore [note=…]

TAG_RE = re.compile(r"@pacing\b(?!-ignore)(.*)$")
IGNORE_RE = re.compile(r"@pacing-ignore\b(.*)$")
KV_RE = re.compile(r"""(\w+)=("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)""")
VALUE_RE = re.compile(
    r"""^
    (?P<amount>[+-]?\d+(?:\.\d+)?)
    (?:
        /(?P<rate_unit>s)
        |
        /(?P<period>[+-]?\d+(?:\.\d+)?)(?P<period_unit>s|ms|min)
        |
        (?P<unit>s|ms|min)
        |
        (?P<res>[A-Za-z_]+)
    )?
    $""",
    re.VERBOSE,
)
NUM_RE = re.compile(r"(?<![A-Za-z_])(\d+(?:\.\d+)?)")

REQUIRED_KEYS = ("kind", "id", "value")
VALID_KINDS = frozenset(
    {"cooldown", "trigger", "interval", "income", "consume", "cost", "threshold"}
)
VALID_UNITS = frozenset({"s", "ms", "min"})

PHASE_ORDER = [
    "room_dark",
    "room_fire",
    "stranger",
    "forest",
    "village",
    "path",
    "world",
    "slice_complete",
]

# Lines that look like timing but are not game-pacing definitions.
TIMING_KEYWORDS = (
    "cooldown",
    "setcooldown",
    "settimeout",
    "setinterval",
    "timeout",
    "pop_timer",
    "stuck_minutes",
    "stuckminutes",
    "snapshot_every",
    "snapshotevery",
    "snapshot_interval",
    "cool_at",
    "arrives_at",
    "need_wood_at",
    "next_temp_at",
    "next_builder_tick",
    "next_world_event",
    "income_acc",
    "time_scale",
    "delay_sec",
)

SKIP_UNTAGGED_SNIPPETS = (
    "occurred_at",
    "saved_at",
    "inserted_at",
    "code < 200",
    "code >= 300",
    "vector2",
    "font_size",
    "custom_minimum_size",
    "stuck_minutes * 60",
    "stuckminutes * 60",
    "this.stuckminutes * 60",
)

ACTION_COOLDOWN = {
    "gather_wood": ("gather", 60.0),
    "stoke_fire": ("stoke", 10.0),
    "check_traps": ("traps", 90.0),
}

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCAN_ROOTS = [
    REPO_ROOT / "godot" / "build" / "web",
    REPO_ROOT / "godot" / "scripts",
]
SCAN_SUFFIXES = {".js", ".gd"}
SKIP_BASENAMES = {"telemetry-config.js", "supabase.js"}


# ---------------------------------------------------------------------------
# Tag parser
# ---------------------------------------------------------------------------


def _unquote(raw: str) -> str:
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {"'", '"'}:
        return raw[1:-1]
    return raw


def parse_duration(token: str) -> dict[str, Any]:
    """Parse a value token into seconds and/or a per-second rate."""
    m = VALUE_RE.match(token.strip())
    if not m:
        raise ValueError(f"invalid @pacing value: {token!r}")
    amount = float(m.group("amount"))
    written = [amount]
    if m.group("period"):
        written.append(float(m.group("period")))
    info: dict[str, Any] = {
        "raw": token,
        "amount": amount,
        "unit": m.group("unit") or m.group("period_unit") or m.group("rate_unit") or m.group("res") or "",
        "seconds": None,
        "rate_per_sec": None,
        "written_numbers": written,
        "dimensionless": False,
    }
    if m.group("rate_unit") == "s":
        info["rate_per_sec"] = amount
        info["unit"] = "/s"
        return info
    if m.group("period") and m.group("period_unit"):
        period_sec = to_seconds(float(m.group("period")), m.group("period_unit"))
        info["seconds"] = period_sec
        if period_sec:
            info["rate_per_sec"] = amount / period_sec
        return info
    if m.group("unit"):
        info["seconds"] = to_seconds(amount, m.group("unit"))
        return info
    info["dimensionless"] = True
    info["amount"] = amount
    return info


def to_seconds(amount: float, unit: str) -> float:
    if unit == "s":
        return amount
    if unit == "ms":
        return amount / 1000.0
    if unit == "min":
        return amount * 60.0
    raise ValueError(f"unsupported unit: {unit}")


def parse_tag(text: str) -> dict[str, Any] | None:
    """Parse one @pacing tag from a comment or raw attribute string."""
    raw = text.strip()
    if raw.startswith("//"):
        raw = raw[2:].strip()
    if raw.startswith("#"):
        raw = raw[1:].strip()
    m = TAG_RE.search(raw) if "@pacing" in raw else TAG_RE.search("@pacing " + raw)
    if not m:
        return None
    rest = m.group(1) or ""
    fields: dict[str, str] = {}
    note_m = re.search(r"\bnote=(.*)$", rest)
    if note_m:
        fields["note"] = _unquote(note_m.group(1).strip())
        rest = rest[: note_m.start()]
    for k, v in KV_RE.findall(rest):
        fields[k] = _unquote(v)
    missing = [k for k in REQUIRED_KEYS if k not in fields]
    if missing:
        raise ValueError(f"@pacing missing {missing}: {text.strip()}")
    if fields["kind"] not in VALID_KINDS:
        raise ValueError(f"unknown @pacing kind={fields['kind']!r}")
    parsed = parse_duration(fields["value"])
    out = {
        "kind": fields["kind"],
        "id": fields["id"],
        "value": fields["value"],
        "phase": fields.get("phase", ""),
        "note": fields.get("note", ""),
        "min": fields.get("min"),
        "max": fields.get("max"),
        "min_sec": parse_duration(fields["min"])["seconds"] if fields.get("min") else None,
        "max_sec": parse_duration(fields["max"])["seconds"] if fields.get("max") else None,
        **parsed,
    }
    return out


def parse_ignore(text: str) -> bool:
    raw = text.strip()
    if raw.startswith("//"):
        raw = raw[2:].strip()
    if raw.startswith("#"):
        raw = raw[1:].strip()
    return bool(IGNORE_RE.search(raw))


# ---------------------------------------------------------------------------
# Source scan
# ---------------------------------------------------------------------------


def _is_comment_or_blank(line: str) -> bool:
    s = line.strip()
    return not s or s.startswith("//") or s.startswith("#")


def _line_numbers(line: str) -> list[float]:
    return [float(x) for x in NUM_RE.findall(line)]


def _norm(line: str) -> str:
    return re.sub(r"\s+", "", line).lower()


def _has_timing_keyword(line: str) -> bool:
    n = _norm(line)
    return any(k in n for k in TIMING_KEYWORDS)


def _should_skip_untagged(line: str) -> bool:
    n = _norm(line)
    if any(_norm(s) in n for s in SKIP_UNTAGGED_SNIPPETS):
        return True
    if re.search(r"\b(get|has)\s*\(", line) and "cooldown" in n:
        return True
    nums = _line_numbers(line)
    if nums and all(x == 0 for x in nums) and "cooldown" in n:
        return True
    # Flag comparisons that wait on an already-tagged timestamp, without a new +N duration.
    if re.search(
        r"(need_wood_at|builder_arrives_at|next_temp_at|fire_cool_at|next_builder_tick|next_world_event_at)",
        line,
    ) and "+" not in line:
        return True
    # Follow-up income_acc arithmetic after the tagged >= period check.
    if "income_acc" in n and ">=" not in line:
        return True
    return False


def _next_code_line(lines: list[str], idx: int) -> tuple[int, str] | None:
    j = idx + 1
    while j < len(lines):
        s = lines[j].strip()
        if not s:
            j += 1
            continue
        if "@pacing" in s:
            j += 1
            continue
        return j, lines[j]
    return None


def _numbers_match(tag: dict[str, Any], line: str) -> bool:
    found = _line_numbers(line)
    if not found:
        return False
    for written in tag["written_numbers"]:
        for n in found:
            if abs(n - written) < 1e-9:
                return True
            if tag.get("unit") == "min" and abs(n - 60.0) < 1e-9:
                return True
    return False


def iter_source_files(roots: Iterable[Path]) -> list[Path]:
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        if root.is_file():
            files.append(root)
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix in SCAN_SUFFIXES and path.name not in SKIP_BASENAMES:
                files.append(path)
    return files


def scan_tags(roots: Iterable[Path] | None = None) -> dict[str, Any]:
    roots = list(roots) if roots is not None else DEFAULT_SCAN_ROOTS
    tags: list[dict[str, Any]] = []
    mismatches: list[dict[str, Any]] = []
    untagged: list[dict[str, Any]] = []
    for path in iter_source_files(roots):
        rel = str(path.relative_to(REPO_ROOT)) if path.is_relative_to(REPO_ROOT) else str(path)
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        pending: list[dict[str, Any]] = []
        ignore_next = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if parse_ignore(stripped):
                ignore_next = True
                pending = []
                continue
            if "@pacing" in stripped and "@pacing-ignore" not in stripped:
                try:
                    tag = parse_tag(stripped)
                except ValueError as exc:
                    mismatches.append(
                        {"file": rel, "line": i + 1, "reason": str(exc), "text": stripped}
                    )
                    continue
                if tag:
                    tag["file"] = rel
                    tag["line"] = i + 1
                    nxt = _next_code_line(lines, i)
                    if nxt is None or not _numbers_match(tag, nxt[1]):
                        mismatches.append(
                            {
                                "file": rel,
                                "line": i + 1,
                                "reason": "tagged value does not match the next-line literal",
                                "value": tag["value"],
                                "next": nxt[1].strip() if nxt else "",
                            }
                        )
                    tags.append(tag)
                    pending.append(tag)
                continue
            if _is_comment_or_blank(line):
                if not stripped.startswith("//") and not stripped.startswith("#"):
                    pending = []
                    ignore_next = False
                continue
            if ignore_next:
                ignore_next = False
                pending = []
                continue
            if pending:
                pending = []
                continue
            if _has_timing_keyword(line) and not _should_skip_untagged(line):
                nums = [n for n in _line_numbers(line) if n != 0]
                if nums:
                    untagged.append(
                        {
                            "file": rel,
                            "line": i + 1,
                            "reason": "numeric timing literal near a known keyword is not tagged",
                            "text": stripped,
                        }
                    )
    return {"tags": tags, "mismatches": mismatches, "untagged": untagged}


def unique_design_tags(tags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate the same id/kind across JS and GDScript."""
    seen: dict[tuple[str, str, str], dict[str, Any]] = {}
    for tag in tags:
        key = (tag["kind"], tag["id"], tag["value"])
        if key not in seen:
            seen[key] = tag
    return list(seen.values())


# ---------------------------------------------------------------------------
# Expected curve
# ---------------------------------------------------------------------------


def _tag_rate(tag: dict[str, Any]) -> float:
    if tag.get("rate_per_sec"):
        return float(tag["rate_per_sec"])
    return 0.0


def derive_expected_curve(tags: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Build min/max seconds per phase from triggers, cooldowns, cost vs income."""
    design = unique_design_tags(tags)
    by_id = {(t["kind"], t["id"]): t for t in design}
    by_phase: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for t in design:
        if t.get("phase"):
            by_phase[t["phase"]].append(t)

    def pick(*keys: tuple[str, str]) -> dict[str, Any] | None:
        for k in keys:
            if k in by_id:
                return by_id[k]
        return None

    arrives = pick(("trigger", "builder_arrives"))
    need_wood = pick(("trigger", "need_wood"))
    builder_tick = pick(("trigger", "builder_tick"))
    temp_tick = pick(("interval", "temp_tick"))
    hut = pick(("cost", "hut_base"))
    starter = pick(("income", "outside_starter_wood"))
    gather = pick(("income", "gather_wood"))
    builder_inc = pick(("income", "builder_wood"))
    traps_cd = pick(("cooldown", "traps"))
    warm = pick(("threshold", "builder_warm"))

    arrive_s = arrives["seconds"] if arrives and arrives["seconds"] else 30.0
    need_s = need_wood["seconds"] if need_wood and need_wood["seconds"] else 15.0
    tick_s = builder_tick["seconds"] if builder_tick and builder_tick["seconds"] else 30.0
    temp_s = temp_tick["seconds"] if temp_tick and temp_tick["seconds"] else 30.0
    hut_wood = hut["amount"] if hut else 100.0
    start_wood = starter["amount"] if starter else 4.0
    gather_rate = _tag_rate(gather) if gather else 10.0 / 60.0
    builder_rate = _tag_rate(builder_inc) if builder_inc else 2.0 / 10.0
    trap_s = traps_cd["seconds"] if traps_cd and traps_cd["seconds"] else 90.0
    warm_need = int(warm["amount"]) if warm else 3

    # Forest: builder must reach level 4 (warm + two 30s ticks) then earn hut wood.
    pre_forest = arrive_s + need_s
    temp_ready = max(0.0, warm_need * temp_s - pre_forest)
    builder_ready = temp_ready + 2 * tick_s
    need_wood_amt = max(0.0, hut_wood - start_wood)
    peak_rate = gather_rate + builder_rate
    low_rate = builder_rate if builder_rate else gather_rate
    earn_min = need_wood_amt / peak_rate if peak_rate else 0.0
    earn_max = need_wood_amt / low_rate if low_rate else earn_min
    forest_min = builder_ready + earn_min
    forest_max = builder_ready + earn_max * 1.5
    if hut and hut.get("min_sec") is not None:
        forest_min = min(forest_min, hut["min_sec"])
    if hut and hut.get("max_sec") is not None:
        forest_max = max(forest_max, hut["max_sec"])

    curve: dict[str, dict[str, Any]] = {
        "room_dark": {
            "min_sec": 0.0,
            "max_sec": 30.0,
            "basis": "等待点击「生火」，无强制等待",
        },
        "room_fire": {
            "min_sec": arrives["min_sec"] if arrives and arrives["min_sec"] is not None else arrive_s,
            "max_sec": arrives["max_sec"] if arrives and arrives["max_sec"] is not None else arrive_s + 5,
            "basis": f"trigger builder_arrives={arrive_s:g}s",
        },
        "stranger": {
            "min_sec": need_wood["min_sec"] if need_wood and need_wood["min_sec"] is not None else need_s,
            "max_sec": need_wood["max_sec"] if need_wood and need_wood["max_sec"] is not None else need_s + 5,
            "basis": f"trigger need_wood={need_s:g}s",
        },
        "forest": {
            "min_sec": round(forest_min, 1),
            "max_sec": round(forest_max, 1),
            "basis": (
                f"建造者就绪 {builder_ready:g}s（室温{warm_need}×{temp_s:g}s − 前序{pre_forest:g}s "
                f"+ 两次建造者节拍 {tick_s:g}s）；"
                f"小屋 {hut_wood:g} 木头 − 开局 {start_wood:g} = {need_wood_amt:g}；"
                f"峰值收入 {peak_rate:.3f}/s → {earn_min:.0f}s，"
                f"仅建造者 {low_rate:.3f}/s → {earn_max:.0f}s"
            ),
        },
        "village": {
            "min_sec": trap_s,
            "max_sec": trap_s * 4,
            "basis": f"陷阱冷却 {trap_s:g}s，毛皮约 50% 命中，按 1–4 次查看",
        },
        "path": {
            "min_sec": 0.0,
            "max_sec": 60.0,
            "basis": "装肉并出发，无强制等待",
        },
        "world": {
            "min_sec": 0.0,
            "max_sec": 120.0,
            "basis": "旧房子曼哈顿距离 5 格，移动即时结算",
        },
        "slice_complete": {
            "min_sec": 0.0,
            "max_sec": 0.0,
            "basis": "终态",
        },
    }
    return curve


# ---------------------------------------------------------------------------
# Playtest events
# ---------------------------------------------------------------------------


def _as_events(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [e for e in payload if isinstance(e, dict)]
    if isinstance(payload, dict):
        for key in ("events", "data", "rows"):
            if isinstance(payload.get(key), list):
                return [e for e in payload[key] if isinstance(e, dict)]
    raise ValueError("input JSON must be a list of events or {events|data|rows: [...]}")


def load_events_file(path: Path) -> list[dict[str, Any]]:
    return _as_events(json.loads(path.read_text(encoding="utf-8")))


def _supabase_base(url: str) -> str:
    url = url.rstrip("/")
    if url.endswith("/playtest_events"):
        return url
    if url.endswith("/rest/v1"):
        return url + "/playtest_events"
    return url + "/rest/v1/playtest_events"


def fetch_supabase_events(
    url: str | None = None,
    key: str | None = None,
    page_size: int = 1000,
) -> list[dict[str, Any]]:
    url = url or os.environ.get("SUPABASE_URL", "")
    key = (
        key
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_READ_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or ""
    )
    if not url or not key:
        raise RuntimeError(
            "Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_READ_KEY). "
            "anon RLS is insert-only, so the anon key cannot read rows."
        )
    endpoint = _supabase_base(url)
    query = urllib.parse.urlencode(
        {
            "select": "session_id,event_name,occurred_at,game_time_sec,phase,payload",
            "event_name": "neq.director_think",
            "order": "occurred_at.asc",
        }
    )
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        req = urllib.request.Request(
            f"{endpoint}?{query}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
                "Range": f"{start}-{start + page_size - 1}",
                "Prefer": "count=exact",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                chunk = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase HTTP {exc.code}: {body[:400]}") from exc
        if not isinstance(chunk, list) or not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        start += page_size
    return rows


def _game_time(event: dict[str, Any]) -> float | None:
    raw = event.get("game_time_sec")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _payload(event: dict[str, Any]) -> dict[str, Any]:
    p = event.get("payload")
    if isinstance(p, str):
        try:
            p = json.loads(p)
        except json.JSONDecodeError:
            return {}
    return p if isinstance(p, dict) else {}


def filter_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e for e in events if e.get("event_name") != "director_think"]


# ---------------------------------------------------------------------------
# Actual curve + comparisons
# ---------------------------------------------------------------------------


def _median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def _mean(xs: list[float]) -> float | None:
    return statistics.fmean(xs) if xs else None


def collect_phase_times(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Prefer phase_time.payload.seconds; also reconstruct incomplete dwells."""
    completed: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple[str, str, float]] = set()
    for e in events:
        if e.get("event_name") != "phase_time":
            continue
        p = _payload(e)
        phase = p.get("phase") or e.get("phase")
        try:
            seconds = float(p.get("seconds"))
        except (TypeError, ValueError):
            continue
        if not phase or seconds <= 0 or seconds > 6 * 3600:
            continue
        key = (str(e.get("session_id")), str(phase), round(seconds, 1))
        if key in seen:
            continue
        seen.add(key)
        completed[str(phase)].append(
            {
                "session_id": e.get("session_id"),
                "seconds": seconds,
                "game_time_sec": _game_time(e),
            }
        )

    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for e in events:
        gt = _game_time(e)
        if gt is None or not e.get("session_id"):
            continue
        by_session[str(e["session_id"])].append(e)
    for sid in by_session:
        by_session[sid].sort(key=lambda ev: (_game_time(ev) or 0.0, ev.get("occurred_at") or ""))

    incomplete: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sid, evs in by_session.items():
        entered: dict[str, float] = {}
        last_phase = None
        last_gt = 0.0
        for e in evs:
            gt = _game_time(e) or 0.0
            phase = e.get("phase") or ""
            if not phase:
                continue
            if last_phase is None:
                entered[phase] = gt
                last_phase = phase
            elif phase != last_phase:
                entered[phase] = gt
                last_phase = phase
            last_gt = gt
        if last_phase and last_phase not in {"", "slice_complete"}:
            start = entered.get(last_phase, 0.0)
            dwell = last_gt - start
            already = {round(x["seconds"], 1) for x in completed.get(last_phase, []) if x["session_id"] == sid}
            if dwell > 0 and round(dwell, 1) not in already:
                incomplete[last_phase].append(
                    {"session_id": sid, "seconds": dwell, "game_time_sec": last_gt}
                )

    summary: dict[str, Any] = {}
    for phase in PHASE_ORDER:
        xs = [x["seconds"] for x in completed.get(phase, [])]
        inc = [x["seconds"] for x in incomplete.get(phase, [])]
        summary[phase] = {
            "completed": completed.get(phase, []),
            "incomplete": incomplete.get(phase, []),
            "n_completed": len(xs),
            "n_incomplete": len(inc),
            "median_sec": _median(xs),
            "mean_sec": _mean(xs),
            "min_sec": min(xs) if xs else None,
            "max_sec": max(xs) if xs else None,
            "incomplete_median_sec": _median(inc),
        }
    return summary


def classify_phase(actual_sec: float | None, expected: dict[str, Any], completed: bool) -> str:
    if actual_sec is None:
        return "no_data"
    lo, hi = expected["min_sec"], expected["max_sec"]
    if not completed:
        if actual_sec > hi:
            return "slower"
        if actual_sec < lo:
            return "in_progress"
        return "in_progress"
    if actual_sec < lo:
        return "faster"
    if actual_sec > hi:
        return "slower"
    return "on_track"


def compare_phases(actual: dict[str, Any], expected: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for phase in PHASE_ORDER:
        exp = expected[phase]
        act = actual.get(phase, {})
        verdict = classify_phase(act.get("median_sec"), exp, completed=act.get("n_completed", 0) > 0)
        if verdict == "no_data" and act.get("n_incomplete"):
            verdict = classify_phase(act.get("incomplete_median_sec"), exp, completed=False)
        rows.append(
            {
                "phase": phase,
                "expected_min_sec": exp["min_sec"],
                "expected_max_sec": exp["max_sec"],
                "expected_basis": exp["basis"],
                "actual_median_sec": act.get("median_sec"),
                "actual_mean_sec": act.get("mean_sec"),
                "actual_min_sec": act.get("min_sec"),
                "actual_max_sec": act.get("max_sec"),
                "n_completed": act.get("n_completed", 0),
                "n_incomplete": act.get("n_incomplete", 0),
                "incomplete_median_sec": act.get("incomplete_median_sec"),
                "verdict": verdict,
            }
        )
    return rows


def action_intervals(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    times: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for e in events:
        if e.get("event_name") != "player_action":
            continue
        action = _payload(e).get("action")
        gt = _game_time(e)
        if action in ACTION_COOLDOWN and gt is not None:
            times[action][str(e.get("session_id"))].append(gt)
    rows = []
    for action, (cid, cooldown) in ACTION_COOLDOWN.items():
        intervals: list[float] = []
        for sid, ts in times[action].items():
            ts.sort()
            for a, b in zip(ts, ts[1:]):
                gap = b - a
                if 0 < gap < 3600:
                    intervals.append(gap)
        n_clicks = sum(len(v) for v in times[action].values())
        med = _median(intervals)
        utilization = None
        if med and med > 0:
            utilization = round(min(100.0, 100.0 * cooldown / med), 1)
        rows.append(
            {
                "action": action,
                "cooldown_id": cid,
                "cooldown_sec": cooldown,
                "n_clicks": n_clicks,
                "n_intervals": len(intervals),
                "median_interval_sec": med,
                "mean_interval_sec": _mean(intervals),
                "min_interval_sec": min(intervals) if intervals else None,
                "max_interval_sec": max(intervals) if intervals else None,
                "utilization_pct": utilization,
            }
        )
    return rows


def resource_flow(events: list[dict[str, Any]]) -> dict[str, Any]:
    wood_in = 0.0
    wood_out = 0.0
    gather_clicks = 0
    stoke_clicks = 0
    light_clicks = 0
    build_clicks = 0
    by_session_snap: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for e in events:
        name = e.get("event_name")
        p = _payload(e)
        if name == "player_action":
            action = p.get("action")
            if action == "gather_wood":
                gather_clicks += 1
                wood_in += 10
            elif action == "stoke_fire":
                stoke_clicks += 1
                wood_out += 1
            elif action == "light_fire":
                light_clicks += 1
            elif action == "build":
                build_clicks += 1
        elif name == "resource_snapshot":
            stores = p.get("stores") or {}
            gt = _game_time(e)
            try:
                wood = float(stores.get("wood") or 0)
            except (TypeError, ValueError):
                continue
            if gt is not None:
                by_session_snap[str(e.get("session_id"))].append((gt, wood))
        elif name == "director_tool" and p.get("tool") == "give_item":
            args = p.get("args") or {}
            if args.get("item") == "wood":
                try:
                    amt = float(args.get("amount") or 0)
                except (TypeError, ValueError):
                    amt = 0
                if amt > 0:
                    wood_in += amt
                else:
                    wood_out += -amt

    snap_delta = 0.0
    snap_pairs = 0
    for sid, pts in by_session_snap.items():
        pts.sort()
        if len(pts) >= 2:
            snap_delta += pts[-1][1] - pts[0][1]
            snap_pairs += 1

    design_gather_in = gather_clicks * 10
    design_stoke_out = stoke_clicks * 1
    return {
        "wood_in_from_actions": wood_in,
        "wood_out_from_actions": wood_out,
        "net_from_actions": wood_in - wood_out,
        "snapshot_net_delta": snap_delta,
        "snapshot_sessions": snap_pairs,
        "gather_clicks": gather_clicks,
        "stoke_clicks": stoke_clicks,
        "light_clicks": light_clicks,
        "build_clicks": build_clicks,
        "design_gather_wood_in": design_gather_in,
        "design_stoke_wood_out": design_stoke_out,
        "note": "伐木按每次 +10（无货车）；添柴按每次 −1（木头已初始化后）",
    }


def analyze(
    events: list[dict[str, Any]],
    tags: list[dict[str, Any]],
) -> dict[str, Any]:
    events = filter_events(events)
    expected = derive_expected_curve(tags)
    actual = collect_phase_times(events)
    phases = compare_phases(actual, expected)
    actions = action_intervals(events)
    resources = resource_flow(events)
    sessions = sorted({str(e.get("session_id")) for e in events if e.get("session_id")})
    slower = [p for p in phases if p["verdict"] == "slower"]
    faster = [p for p in phases if p["verdict"] == "faster"]
    return {
        "n_events": len(events),
        "n_sessions": len(sessions),
        "sessions": sessions,
        "expected": expected,
        "actual": {
            phase: {k: v for k, v in row.items() if k not in {"completed", "incomplete"}}
            for phase, row in actual.items()
        },
        "phases": phases,
        "slower_than_expected": slower,
        "faster_than_expected": faster,
        "actions": actions,
        "resources": resources,
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


def _fmt_sec(v: Any) -> str:
    if v is None:
        return "—"
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "—"
    if abs(x) >= 90:
        return f"{x:.1f}s ({x / 60:.1f}min)"
    return f"{x:.1f}s"


VERDICT_ZH = {
    "slower": "偏慢（可能盯着按钮）",
    "faster": "偏快（可能跳过内容）",
    "on_track": "符合预期",
    "in_progress": "未完成（仍在该阶段）",
    "no_data": "无数据",
}


def render_markdown(
    scan: dict[str, Any],
    result: dict[str, Any],
    *,
    source: str,
    date: str,
) -> str:
    design = unique_design_tags(scan["tags"])
    lines = [
        f"# 节奏分析 {date}",
        "",
        "独立脚本 `tools/pacing_analyzer.py` 生成，不依赖 agent。",
        "",
        "## 数据来源",
        "",
        f"- 事件：{source}",
        f"- 事件数：{result['n_events']}（已排除 `director_think`）",
        f"- 会话数：{result['n_sessions']}",
        f"- 计时：一律用 `game_time_sec`（游戏时间会暂停，不用墙钟）",
        "",
        "## 标签检查",
        "",
        f"- 扫描到 `@pacing` 标签 {len(scan['tags'])} 条（去重后 {len(design)} 条设计常量）",
        f"- 标签值与下一行字面量不一致：{len(scan['mismatches'])}",
        f"- 疑似未标注的计时字面量：{len(scan['untagged'])}",
        "",
    ]
    if scan["mismatches"]:
        lines += ["### 不一致", ""]
        for m in scan["mismatches"][:20]:
            lines.append(f"- `{m['file']}:{m['line']}` {m.get('reason')} value={m.get('value', '')} → `{m.get('next', m.get('text', ''))}`")
        lines.append("")
    if scan["untagged"]:
        lines += ["### 未标注", ""]
        for u in scan["untagged"][:20]:
            lines.append(f"- `{u['file']}:{u['line']}` `{u['text']}`")
        lines.append("")

    lines += [
        "## 阶段曲线（预期 vs 实际）",
        "",
        "| 阶段 | 预期 min | 预期 max | 实际中位 | 实际均值 | 完成样本 | 未完成 | 判定 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for p in result["phases"]:
        lines.append(
            "| {phase} | {emin} | {emax} | {amed} | {amean} | {nc} | {ni} | {ver} |".format(
                phase=p["phase"],
                emin=_fmt_sec(p["expected_min_sec"]),
                emax=_fmt_sec(p["expected_max_sec"]),
                amed=_fmt_sec(p["actual_median_sec"]),
                amean=_fmt_sec(p["actual_mean_sec"]),
                nc=p["n_completed"],
                ni=p["n_incomplete"],
                ver=VERDICT_ZH.get(p["verdict"], p["verdict"]),
            )
        )
    lines += ["", "### 预期怎么来的", ""]
    for p in result["phases"]:
        lines.append(f"- **{p['phase']}**：{p['expected_basis']}")
    lines += ["", "### 读法", ""]
    lines += [
        "- **偏慢**：玩家停留超过设计窗口，可能盯着冷却条或没发现下一个按钮。",
        "- **偏快**：短于触发器/成本下界，可能用了加速或跳过了建造者剧情。",
        "- **未完成**：会话停在该阶段；森林中位若远低于小屋成本时间，多半是试玩中断而不是破关过快。",
        "",
        "## 操作间隔 vs 冷却",
        "",
        "| 操作 | 设计冷却 | 点击次数 | 间隔中位 | 利用率 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for a in result["actions"]:
        util = f"{a['utilization_pct']}%" if a["utilization_pct"] is not None else "—"
        lines.append(
            f"| {a['action']} (`{a['cooldown_id']}`) | {_fmt_sec(a['cooldown_sec'])} | {a['n_clicks']} | {_fmt_sec(a['median_interval_sec'])} | {util} |"
        )
    lines += [
        "",
        "利用率 = 冷却 / 实际间隔中位。接近 100% 表示一好就点；远低于 50% 表示按钮闲置。",
        "",
        "## 资源进出 vs 设计",
        "",
    ]
    r = result["resources"]
    lines += [
        f"- 伐木点击 {r['gather_clicks']} 次，设计入账 {r['design_gather_wood_in']} 木头（每次 +10）",
        f"- 添柴点击 {r['stoke_clicks']} 次，设计消耗 {r['design_stoke_wood_out']} 木头（每次 −1）",
        f"- 生火点击 {r['light_clicks']} 次，建造 {r['build_clicks']} 次",
        f"- 动作合计：入 {r['wood_in_from_actions']:g} / 出 {r['wood_out_from_actions']:g} / 净 {r['net_from_actions']:g}",
        f"- 快照净变化（{r['snapshot_sessions']} 个会话首末差之和）：{r['snapshot_net_delta']:g}",
        f"- {r['note']}",
        "",
        "## 设计常量（去重）",
        "",
        "| kind | id | value | phase | note |",
        "| --- | --- | --- | --- | --- |",
    ]
    for t in design:
        lines.append(
            f"| {t['kind']} | {t['id']} | {t['value']} | {t.get('phase') or ''} | {t.get('note') or ''} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_reports(
    md: str,
    payload: dict[str, Any],
    out_dir: Path,
    date: str,
) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / f"pacing-{date}.md"
    json_path = out_dir / f"pacing-{date}.json"
    md_path.write_text(md, encoding="utf-8")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return md_path, json_path


def notify_webhook(payload: dict[str, Any], markdown: str, url: str | None = None) -> bool:
    url = url or os.environ.get("PACING_WEBHOOK_URL", "")
    if not url:
        return False
    body = json.dumps(
        {
            "title": f"pacing {payload.get('date')}",
            "n_events": payload.get("n_events"),
            "n_sessions": payload.get("n_sessions"),
            "slower": [p["phase"] for p in payload.get("slower_than_expected", [])],
            "faster": [p["phase"] for p in payload.get("faster_than_expected", [])],
            "markdown": markdown,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except urllib.error.URLError as exc:
        print(f"webhook failed: {exc}", file=sys.stderr)
        return False
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def today() -> str:
    return dt.date.today().isoformat()


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="A Dark Room remake pacing analyzer (no agent)")
    p.add_argument("--input", type=Path, help="Offline playtest_events JSON (list of rows)")
    p.add_argument("--out-dir", type=Path, default=REPO_ROOT / "reports")
    p.add_argument("--date", default=None, help="Report date stamp (default: today)")
    p.add_argument("--scan-root", action="append", type=Path, dest="scan_roots")
    p.add_argument("--check-only", action="store_true", help="Only scan @pacing tags")
    p.add_argument("--no-webhook", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    date = args.date or today()
    roots = args.scan_roots or DEFAULT_SCAN_ROOTS
    scan = scan_tags(roots)
    if args.check_only:
        print(
            json.dumps(
                {
                    "n_tags": len(scan["tags"]),
                    "mismatches": scan["mismatches"],
                    "untagged": scan["untagged"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1 if scan["mismatches"] or scan["untagged"] else 0

    source = "supabase"
    if args.input:
        events = load_events_file(args.input)
        source = str(args.input)
    else:
        events = fetch_supabase_events()

    result = analyze(events, scan["tags"])
    md = render_markdown(scan, result, source=source, date=date)
    payload = {
        "date": date,
        "source": source,
        "tag_grammar": {
            "required": ["kind", "id", "value"],
            "optional": ["phase", "min", "max", "note"],
            "kinds": sorted(VALID_KINDS),
            "value": "60s | 300ms | 3min | 0.2/s | 2/10s | 10",
        },
        "scan": {
            "n_tags": len(scan["tags"]),
            "n_design": len(unique_design_tags(scan["tags"])),
            "mismatches": scan["mismatches"],
            "untagged": scan["untagged"],
            "tags": [
                {k: t[k] for k in ("kind", "id", "value", "phase", "min", "max", "note", "file", "line") if k in t}
                for t in scan["tags"]
            ],
        },
        **result,
    }
    md_path, json_path = write_reports(md, payload, args.out_dir, date)
    print(md_path)
    print(json_path)
    if not args.no_webhook:
        notify_webhook(payload, md)
    if scan["mismatches"] or scan["untagged"]:
        print(
            f"tag check: {len(scan['mismatches'])} mismatches, {len(scan['untagged'])} untagged",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
