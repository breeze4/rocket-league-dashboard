"""Tests for API endpoints via FastAPI test client."""
from __future__ import annotations

import db
from tests.conftest import _make_player, make_replay


# --- Sync status ---


async def test_sync_status_default(api_client):
    resp = await api_client.get("/api/sync/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["running"] is False


# --- Players ---


async def test_players_empty(api_client):
    resp = await api_client.get("/api/players")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_players_from_replays(api_client):
    await db.upsert_replay("r1", make_replay(
        replay_id="r1",
        blue_players=[_make_player("Alice", platform_id="A1")],
        orange_players=[_make_player("Bob", platform_id="B1")],
    ))
    resp = await api_client.get("/api/players")
    names = [p["name"] for p in resp.json()]
    assert "Alice" in names
    assert "Bob" in names


# --- Player config ---


async def test_player_config_default(api_client):
    resp = await api_client.get("/api/players/config")
    assert resp.status_code == 200
    assert resp.json()["me"] == []


async def test_player_config_roundtrip(api_client):
    config = {"me": ["Alice"], "teammates": {"Bob": ["Bob"]}}
    put_resp = await api_client.put("/api/players/config", json=config)
    assert put_resp.status_code == 200

    get_resp = await api_client.get("/api/players/config")
    data = get_resp.json()
    assert data["me"] == ["Alice"]
    assert data["teammates"]["Bob"] == ["Bob"]


# --- Replays ---


async def test_list_replays(api_client):
    await db.upsert_replay("r1", make_replay(replay_id="r1"))
    resp = await api_client.get("/api/replays")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "r1"


async def test_get_replay(api_client):
    await db.upsert_replay("r1", make_replay(replay_id="r1"))
    resp = await api_client.get("/api/replays/r1")
    assert resp.status_code == 200
    assert resp.json()["id"] == "r1"


async def test_get_replay_404(api_client):
    resp = await api_client.get("/api/replays/nonexistent")
    assert resp.status_code == 404


# --- Stats ---


async def _setup_stats(config=None):
    """Insert a config and replay so stats endpoints work."""
    cfg = config or {"me": ["TestPlayer"], "teammates": {"Buddy": ["Buddy"]}}
    await db.set_player_config(cfg)
    await db.upsert_replay("r1", make_replay(
        replay_id="r1",
        blue_players=[
            _make_player("TestPlayer", platform_id="P1"),
            _make_player("Buddy", platform_id="P3"),
        ],
        orange_players=[_make_player("Opponent1", platform_id="P2")],
        blue_goals=3,
        orange_goals=1,
    ))


async def test_stats_me_requires_config(api_client):
    resp = await api_client.get("/api/stats/me")
    assert resp.status_code == 400


async def test_stats_me(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "me"
    assert data["stats"]["games"] == 1
    assert data["stats"]["wins"] == 1


async def test_stats_teammates(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/teammates")
    assert resp.status_code == 200
    data = resp.json()
    names = [p["name"] for p in data]
    assert "Buddy" in names


async def test_stats_opponents(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/opponents")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stats"]["games"] >= 1


# --- Scoreline ---


async def test_stats_scoreline(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/scoreline")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["my_goals"] == 3
    assert rows[0]["opp_goals"] == 1


async def test_stats_scoreline_team_size_filter(api_client):
    await _setup_stats()
    # Our replay has 2 blue + 1 orange, max is 2
    resp = await api_client.get("/api/stats/scoreline", params={"team-size": 3})
    assert resp.status_code == 200
    assert resp.json() == []  # no 3s games


# --- Game analysis ---


async def test_stats_games(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/games")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["my_goals"] == 3


async def test_stats_games_team_size_filter(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/games", params={"team-size": 3})
    assert resp.status_code == 200
    assert resp.json() == []


# --- Stats replays (role-resolved) ---


async def test_stats_replays(api_client):
    await _setup_stats()
    resp = await api_client.get("/api/stats/replays")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    players = data[0]["players"]
    roles = [p["role"] for p in players]
    assert "me" in roles
