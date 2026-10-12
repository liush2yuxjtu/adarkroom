#!/usr/bin/env python3
"""Unit tests for the tag parser and comparison logic."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools import pacing_analyzer as pa


class ParseTagTests(unittest.TestCase):
    def test_js_comment(self):
        tag = pa.parse_tag("// @pacing kind=cooldown id=gather value=60s phase=forest")
        self.assertEqual(tag["kind"], "cooldown")
        self.assertEqual(tag["id"], "gather")
        self.assertEqual(tag["value"], "60s")
        self.assertEqual(tag["phase"], "forest")
        self.assertEqual(tag["seconds"], 60.0)

    def test_gdscript_comment(self):
        tag = pa.parse_tag("# @pacing kind=trigger id=need_wood value=15s phase=stranger min=14s max=20s")
        self.assertEqual(tag["kind"], "trigger")
        self.assertEqual(tag["min_sec"], 14.0)
        self.assertEqual(tag["max_sec"], 20.0)

    def test_note_keeps_spaces(self):
        tag = pa.parse_tag(
            "// @pacing kind=cost id=hut_base value=100 phase=forest min=240s max=900s note=first hut vs gather+builder income"
        )
        self.assertEqual(tag["note"], "first hut vs gather+builder income")

    def test_units(self):
        self.assertEqual(pa.parse_duration("300ms")["seconds"], 0.3)
        self.assertEqual(pa.parse_duration("3min")["seconds"], 180.0)
        self.assertEqual(pa.parse_duration("8s")["seconds"], 8.0)
        self.assertAlmostEqual(pa.parse_duration("0.2/s")["rate_per_sec"], 0.2)
        rate = pa.parse_duration("2/10s")
        self.assertEqual(rate["seconds"], 10.0)
        self.assertAlmostEqual(rate["rate_per_sec"], 0.2)
        amt = pa.parse_duration("100")
        self.assertTrue(amt["dimensionless"])
        self.assertEqual(amt["amount"], 100.0)

    def test_missing_required(self):
        with self.assertRaises(ValueError):
            pa.parse_tag("// @pacing kind=cooldown value=60s")
        with self.assertRaises(ValueError):
            pa.parse_tag("// @pacing kind=nope id=x value=1s")

    def test_ignore(self):
        self.assertTrue(pa.parse_ignore("// @pacing-ignore note=autosave"))
        self.assertFalse(pa.parse_ignore("// @pacing kind=cooldown id=x value=1s"))


class ScanCheckTests(unittest.TestCase):
    def _scan(self, source: str, suffix: str = ".js") -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / f"sample{suffix}"
            path.write_text(source, encoding="utf-8")
            return pa.scan_tags([Path(tmp)])

    def test_mismatch_next_line(self):
        src = """
// @pacing kind=cooldown id=gather value=60s phase=forest
state.cooldowns.gather = 45;
"""
        scan = self._scan(src)
        self.assertTrue(any("does not match" in m["reason"] for m in scan["mismatches"]))

    def test_match_next_line(self):
        src = """
// @pacing kind=cooldown id=gather value=60s phase=forest
state.cooldowns.gather = 60;
"""
        scan = self._scan(src)
        self.assertEqual(scan["mismatches"], [])
        self.assertEqual(len(scan["tags"]), 1)

    def test_untagged_near_keyword(self):
        src = """
function act() {
  setCooldown(state, "gather", 60);
}
"""
        scan = self._scan(src)
        self.assertTrue(scan["untagged"])

    def test_ignore_skips_literal(self):
        src = """
// @pacing-ignore note=autosave
if (Date.now() - last >= 3000) persist();
"""
        scan = self._scan(src)
        self.assertEqual(scan["untagged"], [])

    def test_rate_matches_period_literal(self):
        src = """
# @pacing kind=income id=builder_wood value=2/10s phase=forest
if income_acc.builder >= 10:
    pass
"""
        scan = self._scan(src, suffix=".gd")
        self.assertEqual(scan["mismatches"], [])


class CompareTests(unittest.TestCase):
    def test_classify(self):
        exp = {"min_sec": 30.0, "max_sec": 35.0}
        self.assertEqual(pa.classify_phase(30.5, exp, True), "on_track")
        self.assertEqual(pa.classify_phase(12.0, exp, True), "faster")
        self.assertEqual(pa.classify_phase(90.0, exp, True), "slower")
        self.assertEqual(pa.classify_phase(20.0, exp, False), "in_progress")
        self.assertEqual(pa.classify_phase(90.0, exp, False), "slower")
        self.assertEqual(pa.classify_phase(None, exp, True), "no_data")

    def test_utilization(self):
        events = [
            {"session_id": "s1", "event_name": "player_action", "game_time_sec": 10, "phase": "forest", "payload": {"action": "gather_wood"}},
            {"session_id": "s1", "event_name": "player_action", "game_time_sec": 70, "phase": "forest", "payload": {"action": "gather_wood"}},
            {"session_id": "s1", "event_name": "player_action", "game_time_sec": 130, "phase": "forest", "payload": {"action": "gather_wood"}},
            {"session_id": "s1", "event_name": "player_action", "game_time_sec": 20, "phase": "room_fire", "payload": {"action": "stoke_fire"}},
            {"session_id": "s1", "event_name": "player_action", "game_time_sec": 40, "phase": "room_fire", "payload": {"action": "stoke_fire"}},
        ]
        rows = {r["action"]: r for r in pa.action_intervals(events)}
        self.assertEqual(rows["gather_wood"]["median_interval_sec"], 60.0)
        self.assertEqual(rows["gather_wood"]["utilization_pct"], 100.0)
        self.assertEqual(rows["stoke_fire"]["median_interval_sec"], 20.0)
        self.assertEqual(rows["stoke_fire"]["utilization_pct"], 50.0)

    def test_phase_time_uses_game_time_payload(self):
        events = [
            {"session_id": "a", "event_name": "phase_time", "game_time_sec": 32, "phase": "stranger", "payload": {"phase": "room_fire", "seconds": 30.5}},
            {"session_id": "b", "event_name": "phase_time", "game_time_sec": 33, "phase": "stranger", "payload": {"phase": "room_fire", "seconds": 30.8}},
            {"session_id": "c", "event_name": "phase_time", "game_time_sec": 0, "phase": "room_dark", "payload": {"phase": "forest", "seconds": -67.5}},
        ]
        actual = pa.collect_phase_times(events)
        self.assertEqual(actual["room_fire"]["n_completed"], 2)
        self.assertAlmostEqual(actual["room_fire"]["median_sec"], 30.65)
        self.assertEqual(actual["forest"]["n_completed"], 0)

    def test_expected_forest_from_cost_vs_income(self):
        tags = [
            pa.parse_tag("# @pacing kind=trigger id=builder_arrives value=30s phase=room_fire min=28s max=35s"),
            pa.parse_tag("# @pacing kind=trigger id=need_wood value=15s phase=stranger min=14s max=20s"),
            pa.parse_tag("# @pacing kind=trigger id=builder_tick value=30s phase=stranger"),
            pa.parse_tag("# @pacing kind=interval id=temp_tick value=30s phase=room_fire"),
            pa.parse_tag("# @pacing kind=threshold id=builder_warm value=3 phase=stranger"),
            pa.parse_tag("# @pacing kind=cost id=hut_base value=100 phase=forest min=240s max=900s"),
            pa.parse_tag("# @pacing kind=income id=outside_starter_wood value=4 phase=forest"),
            pa.parse_tag("# @pacing kind=income id=gather_wood value=10/60s phase=forest"),
            pa.parse_tag("# @pacing kind=income id=builder_wood value=2/10s phase=forest"),
            pa.parse_tag("# @pacing kind=cooldown id=traps value=90s phase=forest"),
        ]
        curve = pa.derive_expected_curve(tags)
        self.assertEqual(curve["room_fire"]["min_sec"], 28.0)
        self.assertEqual(curve["room_fire"]["max_sec"], 35.0)
        self.assertEqual(curve["stranger"]["min_sec"], 14.0)
        self.assertGreaterEqual(curve["forest"]["min_sec"], 200)
        self.assertLessEqual(curve["forest"]["min_sec"], 400)
        self.assertGreaterEqual(curve["forest"]["max_sec"], 800)
        self.assertEqual(curve["village"]["min_sec"], 90.0)

    def test_compare_marks_slow_room_dark(self):
        expected = pa.derive_expected_curve(
            [
                pa.parse_tag("# @pacing kind=trigger id=builder_arrives value=30s phase=room_fire min=28s max=35s"),
                pa.parse_tag("# @pacing kind=trigger id=need_wood value=15s phase=stranger min=14s max=20s"),
            ]
        )
        actual = {
            "room_dark": {
                "median_sec": 67.7,
                "mean_sec": 67.7,
                "min_sec": 67.7,
                "max_sec": 67.7,
                "n_completed": 1,
                "n_incomplete": 0,
                "incomplete_median_sec": None,
            },
            "room_fire": {
                "median_sec": 30.5,
                "mean_sec": 30.5,
                "min_sec": 30.1,
                "max_sec": 31.0,
                "n_completed": 5,
                "n_incomplete": 0,
                "incomplete_median_sec": None,
            },
        }
        rows = {r["phase"]: r for r in pa.compare_phases(actual, expected)}
        self.assertEqual(rows["room_dark"]["verdict"], "slower")
        self.assertEqual(rows["room_fire"]["verdict"], "on_track")


class AnalyzeApiTests(unittest.TestCase):
    SAMPLE = Path(__file__).resolve().parent / "testdata" / "playtest_events_sample.json"

    def test_sample_loads(self):
        events = pa.load_events_file(self.SAMPLE)
        self.assertEqual(len(events), 577)
        self.assertTrue(all(e.get("event_name") != "director_think" for e in events))

    def test_analyze_schema(self):
        result = pa.analyze(ROOT, input_path=self.SAMPLE)
        self.assertIn("phases", result)
        self.assertIn("cooldown_utilization", result)
        self.assertIn("resource_balance", result)
        self.assertIn("early_phase_slow", result)
        self.assertEqual(result["early_phase_slow_threshold"], 1.5)
        self.assertFalse(result["early_phase_slow"])
        by_phase = {p["phase"]: p for p in result["phases"]}
        fire = by_phase["room_fire"]
        self.assertEqual(fire["expected_min"], 28.0)
        self.assertEqual(fire["expected_max"], 35.0)
        self.assertIsNotNone(fire["actual_median"])
        self.assertGreater(fire["sample_count"], 0)
        self.assertAlmostEqual(fire["ratio"], fire["actual_median"] / fire["expected_max"], places=4)
        self.assertIn("gather", result["cooldown_utilization"])
        self.assertIn("stoke", result["cooldown_utilization"])
        self.assertIn("wood_in", result["resource_balance"])
        self.assertIn("wood_out", result["resource_balance"])
        self.assertIn("net", result["resource_balance"])

    def test_early_phase_slow_threshold(self):
        result = pa.analyze(ROOT, input_path=self.SAMPLE, slow_ratio=0.01)
        self.assertTrue(result["early_phase_slow"])
        self.assertEqual(result["early_phase_slow_threshold"], 0.01)

    def test_json_cli(self):
        buf = StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            rc = pa.main(["--json", "--input", str(self.SAMPLE), "--repo-root", str(ROOT)])
        finally:
            sys.stdout = old
        self.assertEqual(rc, 0)
        payload = json.loads(buf.getvalue())
        self.assertEqual(set(payload), {
            "phases",
            "cooldown_utilization",
            "resource_balance",
            "early_phase_slow",
            "early_phase_slow_threshold",
        })


if __name__ == "__main__":
    unittest.main()
