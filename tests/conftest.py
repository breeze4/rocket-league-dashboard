from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import db


@pytest.fixture
async def tmp_db(monkeypatch, tmp_path):
    """Point db.DB_PATH at a temp file and init the schema."""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(db, "DB_PATH", db_path)
    await db.init_db()
    return db_path


def _make_player(name, platform="steam", platform_id="123", stats=None):
    """Build a player dict matching ballchasing.com shape."""
    return {
        "name": name,
        "id": {"platform": platform, "id": platform_id},
        "stats": stats or {
            "core": {
                "shots": 4, "shots_against": 3, "goals": 2, "goals_against": 1,
                "saves": 1, "assists": 1, "score": 350,
            },
            "boost": {
                "bpm": 100.0, "bcpm": 50.0, "avg_amount": 60.0,
                "amount_collected": 500, "amount_stolen": 100,
                "amount_collected_big": 300, "amount_collected_small": 200,
                "count_collected_big": 3, "count_collected_small": 10,
                "time_zero_boost": 10.0, "time_full_boost": 5.0,
                "percent_zero_boost": 15.0, "percent_full_boost": 8.0,
            },
            "movement": {
                "avg_speed": 1400.0, "total_distance": 50000,
                "time_supersonic_speed": 30.0, "time_boost_speed": 60.0,
                "time_slow_speed": 40.0, "time_ground": 200.0,
                "time_low_air": 30.0, "time_high_air": 10.0,
                "time_powerslide": 5.0, "count_powerslide": 8,
            },
            "positioning": {
                "avg_distance_to_ball": 2500.0,
                "avg_distance_to_ball_possession": 2000.0,
                "avg_distance_to_ball_no_possession": 3000.0,
                "percent_behind_ball": 55.0,
                "time_defensive_third": 100.0, "time_neutral_third": 80.0,
                "time_offensive_third": 60.0,
                "time_defensive_half": 130.0, "time_offensive_half": 110.0,
            },
            "demo": {"inflicted": 1, "taken": 0},
        },
    }


def make_replay(
    replay_id="replay-1",
    date="2025-01-15T20:00:00Z",
    map_name="DFH Stadium",
    playlist_name="Ranked Doubles",
    blue_goals=3,
    orange_goals=1,
    blue_players=None,
    orange_players=None,
    overtime=False,
):
    """Build a replay dict matching ballchasing.com shape."""
    if blue_players is None:
        blue_players = [_make_player("TestPlayer", platform_id="P1")]
    if orange_players is None:
        orange_players = [_make_player("Opponent1", platform_id="P2")]
    return {
        "id": replay_id,
        "title": "Replay",
        "date": date,
        "map_name": map_name,
        "playlist_name": playlist_name,
        "duration": 300,
        "overtime": overtime,
        "blue": {
            "players": blue_players,
            "stats": {"core": {"goals": blue_goals}},
        },
        "orange": {
            "players": orange_players,
            "stats": {"core": {"goals": orange_goals}},
        },
    }


@pytest.fixture
def sample_replay():
    return make_replay()


@pytest.fixture
def sample_config():
    return {
        "me": ["TestPlayer"],
        "teammates": {"Buddy": ["Buddy", "BuddyAlt"]},
    }


@pytest.fixture
async def api_client(monkeypatch, tmp_path):
    """Async httpx client against the FastAPI app with isolated DB and mocked BC client."""
    import httpx

    import server
    from ballchasing_client import BallchasingClient

    # Isolate DB
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(db, "DB_PATH", db_path)
    await db.init_db()

    # Mock the ballchasing client
    mock_client = AsyncMock(spec=BallchasingClient)
    mock_client.ping.return_value = {"steam_id": "test", "name": "test"}
    mock_client.list_replays.return_value = {"count": 0, "list": []}
    mock_client.get_maps.return_value = []
    server.client = mock_client

    # Reset sync status
    from models import SyncStatus
    monkeypatch.setattr(server, "sync_status", SyncStatus(running=False))

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
