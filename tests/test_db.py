"""Tests for db.py — async SQLite layer."""
from __future__ import annotations

import db
from tests.conftest import make_replay


# --- Replay CRUD ---


async def test_upsert_and_get_replay(tmp_db):
    replay = make_replay(replay_id="r1")
    await db.upsert_replay("r1", replay)
    result = await db.get_replay("r1")
    assert result["id"] == "r1"
    assert result["map_name"] == "DFH Stadium"


async def test_get_replay_missing(tmp_db):
    assert await db.get_replay("nonexistent") is None


async def test_replay_exists(tmp_db):
    assert await db.replay_exists("r1") is False
    await db.upsert_replay("r1", make_replay(replay_id="r1"))
    assert await db.replay_exists("r1") is True


async def test_upsert_replay_overwrites(tmp_db):
    await db.upsert_replay("r1", make_replay(replay_id="r1", map_name="Map A"))
    await db.upsert_replay("r1", make_replay(replay_id="r1", map_name="Map B"))
    result = await db.get_replay("r1")
    assert result["map_name"] == "Map B"


async def test_count_replays(tmp_db):
    assert await db.count_replays() == 0
    await db.upsert_replay("r1", make_replay(replay_id="r1"))
    await db.upsert_replay("r2", make_replay(replay_id="r2"))
    assert await db.count_replays() == 2


# --- list_replays ---


async def test_list_replays_ordering(tmp_db):
    await db.upsert_replay("r1", make_replay(replay_id="r1", date="2025-01-01T00:00:00Z"))
    await db.upsert_replay("r2", make_replay(replay_id="r2", date="2025-01-02T00:00:00Z"))
    results = await db.list_replays()
    assert results[0]["id"] == "r2"  # newest first
    assert results[1]["id"] == "r1"


async def test_list_replays_limit_offset(tmp_db):
    for i in range(5):
        await db.upsert_replay(f"r{i}", make_replay(
            replay_id=f"r{i}", date=f"2025-01-0{i+1}T00:00:00Z"
        ))
    page = await db.list_replays(limit=2, offset=0)
    assert len(page) == 2
    page2 = await db.list_replays(limit=2, offset=2)
    assert len(page2) == 2
    assert page[0]["id"] != page2[0]["id"]


async def test_list_replays_filter_map(tmp_db):
    await db.upsert_replay("r1", make_replay(replay_id="r1", map_name="DFH Stadium"))
    await db.upsert_replay("r2", make_replay(replay_id="r2", map_name="Mannfield"))
    results = await db.list_replays(map_name="Mannfield")
    assert len(results) == 1
    assert results[0]["map_name"] == "Mannfield"


async def test_list_replays_filter_date(tmp_db):
    await db.upsert_replay("r1", make_replay(replay_id="r1", date="2025-01-01T00:00:00Z"))
    await db.upsert_replay("r2", make_replay(replay_id="r2", date="2025-02-01T00:00:00Z"))
    results = await db.list_replays(date_after="2025-01-15T00:00:00Z")
    assert len(results) == 1
    assert results[0]["id"] == "r2"


# --- Player config ---


async def test_player_config_default(tmp_db):
    config = await db.get_player_config()
    assert config == {}


async def test_player_config_roundtrip(tmp_db):
    cfg = {"me": ["Alice"], "teammates": {"Bob": ["Bob"]}}
    await db.set_player_config(cfg)
    result = await db.get_player_config()
    assert result == cfg


# --- Sync log ---


async def test_sync_log_lifecycle(tmp_db):
    log_id = await db.create_sync_log("2025-01-01", "2025-01-31")
    assert isinstance(log_id, int)

    await db.complete_sync_log(log_id, "completed", 100, 90, 10)

    history = await db.get_sync_history()
    assert len(history) == 1
    assert history[0]["status"] == "completed"
    assert history[0]["replays_found"] == 100


# --- Replay date counts ---


async def test_replay_date_counts(tmp_db):
    await db.upsert_replay("r1", make_replay(replay_id="r1", date="2025-01-15T10:00:00Z"))
    await db.upsert_replay("r2", make_replay(replay_id="r2", date="2025-01-15T20:00:00Z"))
    await db.upsert_replay("r3", make_replay(replay_id="r3", date="2025-01-16T10:00:00Z"))
    counts = await db.get_replay_date_counts()
    assert counts["2025-01-15"] == 2
    assert counts["2025-01-16"] == 1


# --- Coverage sync ---


async def test_find_covering_sync_found(tmp_db):
    log_id = await db.create_sync_log("2025-01-01", "2025-01-31")
    await db.complete_sync_log(log_id, "completed", 10, 10, 0)
    result = await db.find_covering_sync("2025-01-05", "2025-01-20")
    assert result is not None


async def test_find_covering_sync_not_found(tmp_db):
    log_id = await db.create_sync_log("2025-01-10", "2025-01-20")
    await db.complete_sync_log(log_id, "completed", 10, 10, 0)
    # Request extends beyond the synced range
    result = await db.find_covering_sync("2025-01-01", "2025-01-31")
    assert result is None


async def test_find_covering_sync_ignores_failed(tmp_db):
    log_id = await db.create_sync_log("2025-01-01", "2025-01-31")
    await db.complete_sync_log(log_id, "failed", 0, 0, 0, error="oops")
    result = await db.find_covering_sync("2025-01-05", "2025-01-20")
    assert result is None
