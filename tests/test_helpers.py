"""Tests for pure helper functions in server.py."""
from __future__ import annotations

from models import AggregatedStats
from server import (
    _add_stats,
    _average_stats,
    _build_role_lookup,
    _find_my_team,
    _normalize_date,
    _resolve_player_role,
    _safe_get,
)


# --- _build_role_lookup ---


def test_build_role_lookup_me():
    config = {"me": ["Alice", "AliceAlt"], "teammates": {}}
    lookup = _build_role_lookup(config)
    assert lookup["alice"] == "me"
    assert lookup["alicealt"] == "me"


def test_build_role_lookup_teammates():
    config = {"me": ["Alice"], "teammates": {"Bob": ["Bob", "BobSmurf"]}}
    lookup = _build_role_lookup(config)
    assert lookup["bob"] == "teammate:Bob"
    assert lookup["bobsmurf"] == "teammate:Bob"


def test_build_role_lookup_empty():
    assert _build_role_lookup({}) == {}


# --- _resolve_player_role ---


def test_resolve_known_me():
    lookup = {"alice": "me"}
    assert _resolve_player_role("Alice", True, lookup) == "me"


def test_resolve_known_teammate():
    lookup = {"bob": "teammate:Bob"}
    assert _resolve_player_role("Bob", True, lookup) == "teammate:Bob"


def test_resolve_unknown_on_my_team():
    assert _resolve_player_role("Stranger", True, {}) == "anon_teammate"


def test_resolve_unknown_on_opponent_team():
    assert _resolve_player_role("Stranger", False, {}) == "anon_opponent"


# --- _find_my_team ---


def test_find_my_team_blue(sample_replay):
    lookup = {"testplayer": "me"}
    assert _find_my_team(sample_replay, lookup) == "blue"


def test_find_my_team_orange(sample_replay):
    lookup = {"opponent1": "me"}
    assert _find_my_team(sample_replay, lookup) == "orange"


def test_find_my_team_none(sample_replay):
    assert _find_my_team(sample_replay, {}) is None


# --- _safe_get ---


def test_safe_get_nested():
    d = {"a": {"b": {"c": 42}}}
    assert _safe_get(d, "a", "b", "c") == 42


def test_safe_get_missing_key():
    assert _safe_get({"a": 1}, "b", default=99) == 99


def test_safe_get_non_dict_intermediate():
    assert _safe_get({"a": 5}, "a", "b", default=0) == 0


def test_safe_get_empty():
    assert _safe_get({}, "x", "y") == 0


# --- _add_stats ---


def test_add_stats_accumulates():
    agg = AggregatedStats()
    stats = {
        "core": {"shots": 3, "goals": 2, "saves": 1, "assists": 1, "score": 400},
        "boost": {"bpm": 120.0, "avg_amount": 55.0},
        "movement": {"avg_speed": 1500.0, "total_distance": 40000},
        "positioning": {"avg_distance_to_ball": 2200.0},
        "demo": {"inflicted": 2, "taken": 1},
    }
    _add_stats(agg, stats)
    assert agg.core.shots == 3
    assert agg.core.goals == 2
    assert agg.demo.inflicted == 2

    # Accumulate a second time
    _add_stats(agg, stats)
    assert agg.core.shots == 6
    assert agg.demo.inflicted == 4


def test_add_stats_missing_fields():
    """Missing stat categories shouldn't error."""
    agg = AggregatedStats()
    _add_stats(agg, {})
    assert agg.core.shots == 0


# --- _average_stats ---


def test_average_stats():
    agg = AggregatedStats(games=2)
    agg.core.shots = 10
    agg.core.goals = 4
    agg.core.score = 800
    agg.boost.bpm = 200.0
    agg.movement.avg_speed = 3000.0
    agg.positioning.avg_distance_to_ball = 5000.0

    _average_stats(agg)

    assert agg.core.shooting_percentage == 40.0
    assert agg.core.score == 400.0
    assert agg.boost.bpm == 100.0
    assert agg.movement.avg_speed == 1500.0
    assert agg.positioning.avg_distance_to_ball == 2500.0


def test_average_stats_zero_games():
    agg = AggregatedStats(games=0)
    agg.core.shots = 5
    _average_stats(agg)
    # Should be unchanged — early return
    assert agg.core.shots == 5
    assert agg.core.shooting_percentage == 0.0


def test_average_stats_zero_shots():
    """shooting_percentage stays 0 when no shots taken."""
    agg = AggregatedStats(games=1)
    agg.core.shots = 0
    agg.core.goals = 0
    _average_stats(agg)
    assert agg.core.shooting_percentage == 0.0


# --- _normalize_date ---


def test_normalize_date_none():
    assert _normalize_date(None) is None


def test_normalize_date_start_of_day():
    result = _normalize_date("2025-01-15")
    assert result.startswith("2025-01-15T00:00:00")


def test_normalize_date_end_of_day():
    result = _normalize_date("2025-01-15", end_of_day=True)
    assert result.startswith("2025-01-15T23:59:59")


def test_normalize_date_already_full():
    ts = "2025-01-15T12:00:00+00:00"
    assert _normalize_date(ts) == ts


