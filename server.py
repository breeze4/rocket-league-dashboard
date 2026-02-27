from __future__ import annotations

import asyncio
import os
from collections import Counter
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import db
from ballchasing_client import BallchasingClient
from models import (
    AggregatedStats,
    BoostStats,
    CoreStats,
    DemoStats,
    MovementStats,
    PlayerConfig,
    PlayerFrequency,
    PlayerStats,
    PositioningStats,
    ReplayPlayer,
    ReplaySummary,
    SyncLogEntry,
    SyncStatus,
)

load_dotenv()

client: BallchasingClient
sync_status = SyncStatus(running=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    token = os.environ.get("BALLCHASING_TOKEN", "")
    tier = os.environ.get("BALLCHASING_TIER", "gold")
    client = BallchasingClient(token, tier)
    await db.init_db()
    yield
    await client.close()


app = FastAPI(title="Ballchasing Stats", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Ping ---


@app.get("/api/ping")
async def ping():
    return await client.ping()


# --- Sync ---


@app.post("/api/sync")
async def sync_replays(
    replay_date_after: str | None = Query(None, alias="replay-date-after"),
    replay_date_before: str | None = Query(None, alias="replay-date-before"),
    uploader: str | None = Query(None),
):
    global sync_status
    if sync_status.running:
        raise HTTPException(409, "Sync already in progress")

    covering = await db.find_covering_sync(replay_date_after, replay_date_before)
    if covering:
        return {"message": "Already synced", "covered_by": covering}

    sync_status = SyncStatus(running=True)
    asyncio.create_task(_do_sync(replay_date_after, replay_date_before, uploader))
    return {"message": "Sync started"}


@app.get("/api/sync/status")
async def get_sync_status():
    return sync_status


@app.get("/api/sync/history")
async def get_sync_history(
    limit: int = Query(20, le=100),
) -> list[SyncLogEntry]:
    rows = await db.get_sync_history(limit)
    return [SyncLogEntry(**row) for row in rows]


async def _do_sync(
    date_after: str | None,
    date_before: str | None,
    uploader: str | None,
) -> None:
    global sync_status
    log_id = await db.create_sync_log(date_after, date_before)
    try:
        params: dict = {"count": 200, "sort-by": "replay-date", "sort-dir": "desc"}
        if date_after:
            params["replay-date-after"] = date_after
        if date_before:
            params["replay-date-before"] = date_before
        if uploader:
            params["uploader"] = uploader

        next_url: str | None = None
        first_page = True

        while True:
            if first_page:
                page = await client.list_replays(**params)
                first_page = False
            else:
                # Use the 'next' cursor from the previous response
                page = await client.list_replays(**params)

            replay_list = page.get("list", [])
            sync_status.replays_found += len(replay_list)

            for replay_summary in replay_list:
                rid = replay_summary["id"]
                if await db.replay_exists(rid):
                    sync_status.replays_skipped += 1
                    continue

                detail = await client.get_replay(rid)
                await db.upsert_replay(rid, detail)
                sync_status.replays_fetched += 1

            next_url = page.get("next")
            if not next_url:
                break

            # Extract the 'after' cursor param for next page
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(next_url)
            qs = parse_qs(parsed.query)
            if "after" in qs:
                params["after"] = qs["after"][0]
            else:
                break

        await db.complete_sync_log(
            log_id, "completed",
            sync_status.replays_found, sync_status.replays_fetched,
            sync_status.replays_skipped,
        )
    except Exception as e:
        sync_status.error = str(e)
        await db.complete_sync_log(
            log_id, "failed",
            sync_status.replays_found, sync_status.replays_fetched,
            sync_status.replays_skipped, error=str(e),
        )
    finally:
        sync_status.running = False


# --- Players ---


@app.get("/api/players")
async def list_players() -> list[PlayerFrequency]:
    replays = await db.all_replay_data()
    counter: Counter[tuple[str, str | None, str | None]] = Counter()

    for replay in replays:
        for color in ("blue", "orange"):
            team = replay.get(color, {})
            for player in team.get("players", []):
                name = player.get("name", "Unknown")
                pid = player.get("id", {})
                platform = pid.get("platform")
                platform_id = pid.get("id")
                counter[(name, platform, platform_id)] += 1

    results = [
        PlayerFrequency(name=name, platform=platform, platform_id=pid, count=count)
        for (name, platform, pid), count in counter.most_common()
    ]
    return results


@app.get("/api/players/config")
async def get_player_config():
    config = await db.get_player_config()
    return config if config else {"me": [], "teammates": {}}


@app.put("/api/players/config")
async def set_player_config(config: PlayerConfig):
    await db.set_player_config(config.model_dump())
    return {"message": "Config saved"}


# --- Replays ---


@app.get("/api/replays")
async def list_replays(
    date_after: str | None = Query(None, alias="date-after"),
    date_before: str | None = Query(None, alias="date-before"),
    map_name: str | None = Query(None, alias="map"),
    playlist: str | None = Query(None),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
) -> list[ReplaySummary]:
    replays = await db.list_replays(date_after, date_before, map_name, playlist, limit, offset)
    results = []
    for r in replays:
        blue = r.get("blue", {})
        orange = r.get("orange", {})
        results.append(
            ReplaySummary(
                id=r["id"],
                title=r.get("title"),
                map_name=r.get("map_name"),
                playlist_name=r.get("playlist_name"),
                duration=r.get("duration"),
                date=r.get("date"),
                blue_goals=blue.get("stats", {}).get("core", {}).get("goals"),
                orange_goals=orange.get("stats", {}).get("core", {}).get("goals"),
                overtime=r.get("overtime", False),
            )
        )
    return results


@app.get("/api/replays/{replay_id}")
async def get_replay(replay_id: str):
    replay = await db.get_replay(replay_id)
    if not replay:
        raise HTTPException(404, "Replay not found")
    return replay


# --- Stats ---


def _build_role_lookup(config: dict) -> dict[str, str]:
    """Map lowercase player name -> role string."""
    lookup: dict[str, str] = {}
    for name in config.get("me", []):
        lookup[name.lower()] = "me"
    for teammate_name, aliases in config.get("teammates", {}).items():
        for alias in aliases:
            lookup[alias.lower()] = f"teammate:{teammate_name}"
    return lookup


def _resolve_player_role(
    player_name: str, is_my_team: bool, role_lookup: dict[str, str]
) -> str:
    role = role_lookup.get(player_name.lower())
    if role:
        return role
    return "anon_teammate" if is_my_team else "anon_opponent"


def _find_my_team(replay: dict, role_lookup: dict[str, str]) -> str | None:
    """Return 'blue' or 'orange' based on which team contains a 'me' player."""
    for color in ("blue", "orange"):
        team = replay.get(color, {})
        for player in team.get("players", []):
            if role_lookup.get(player.get("name", "").lower()) == "me":
                return color
    return None


def _safe_get(d: dict, *keys, default=0):
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, default)
        else:
            return default
    return d


def _add_stats(agg: AggregatedStats, player_stats: dict) -> None:
    """Accumulate raw player stats into an AggregatedStats."""
    core = player_stats.get("core", {})
    agg.core.shots += core.get("shots", 0)
    agg.core.shots_against += core.get("shots_against", 0)
    agg.core.goals += core.get("goals", 0)
    agg.core.goals_against += core.get("goals_against", 0)
    agg.core.saves += core.get("saves", 0)
    agg.core.assists += core.get("assists", 0)
    agg.core.score += core.get("score", 0)

    boost = player_stats.get("boost", {})
    agg.boost.bpm += boost.get("bpm", 0)
    agg.boost.bcpm += boost.get("bcpm", 0)
    agg.boost.avg_amount += boost.get("avg_amount", 0)
    agg.boost.amount_collected += boost.get("amount_collected", 0)
    agg.boost.amount_stolen += boost.get("amount_stolen", 0)
    agg.boost.amount_collected_big += boost.get("amount_collected_big", 0)
    agg.boost.amount_collected_small += boost.get("amount_collected_small", 0)
    agg.boost.count_collected_big += boost.get("count_collected_big", 0)
    agg.boost.count_collected_small += boost.get("count_collected_small", 0)
    agg.boost.time_zero_boost += boost.get("time_zero_boost", 0)
    agg.boost.time_full_boost += boost.get("time_full_boost", 0)
    agg.boost.percent_zero_boost += boost.get("percent_zero_boost", 0)
    agg.boost.percent_full_boost += boost.get("percent_full_boost", 0)

    movement = player_stats.get("movement", {})
    agg.movement.avg_speed += movement.get("avg_speed", 0)
    agg.movement.total_distance += movement.get("total_distance", 0)
    agg.movement.time_supersonic_speed += movement.get("time_supersonic_speed", 0)
    agg.movement.time_boost_speed += movement.get("time_boost_speed", 0)
    agg.movement.time_slow_speed += movement.get("time_slow_speed", 0)
    agg.movement.time_ground += movement.get("time_ground", 0)
    agg.movement.time_low_air += movement.get("time_low_air", 0)
    agg.movement.time_high_air += movement.get("time_high_air", 0)
    agg.movement.time_powerslide += movement.get("time_powerslide", 0)
    agg.movement.count_powerslide += movement.get("count_powerslide", 0)

    positioning = player_stats.get("positioning", {})
    agg.positioning.avg_distance_to_ball += positioning.get("avg_distance_to_ball", 0)
    agg.positioning.avg_distance_to_ball_possession += positioning.get(
        "avg_distance_to_ball_possession", 0
    )
    agg.positioning.avg_distance_to_ball_no_possession += positioning.get(
        "avg_distance_to_ball_no_possession", 0
    )
    agg.positioning.time_defensive_third += positioning.get("time_defensive_third", 0)
    agg.positioning.time_neutral_third += positioning.get("time_neutral_third", 0)
    agg.positioning.time_offensive_third += positioning.get("time_offensive_third", 0)
    agg.positioning.time_defensive_half += positioning.get("time_defensive_half", 0)
    agg.positioning.time_offensive_half += positioning.get("time_offensive_half", 0)

    demo = player_stats.get("demo", {})
    agg.demo.inflicted += demo.get("inflicted", 0)
    agg.demo.taken += demo.get("taken", 0)


def _average_stats(agg: AggregatedStats) -> None:
    """Convert accumulated totals to averages for fields that should be averaged."""
    if agg.games == 0:
        return
    n = agg.games
    # shooting_percentage is derived
    if agg.core.shots > 0:
        agg.core.shooting_percentage = round(agg.core.goals / agg.core.shots * 100, 1)
    # Average the per-game metrics
    agg.boost.bpm = round(agg.boost.bpm / n, 1)
    agg.boost.bcpm = round(agg.boost.bcpm / n, 1)
    agg.boost.avg_amount = round(agg.boost.avg_amount / n, 1)
    agg.boost.percent_zero_boost = round(agg.boost.percent_zero_boost / n, 1)
    agg.boost.percent_full_boost = round(agg.boost.percent_full_boost / n, 1)
    agg.movement.avg_speed = round(agg.movement.avg_speed / n, 1)
    agg.positioning.avg_distance_to_ball = round(agg.positioning.avg_distance_to_ball / n, 1)
    agg.positioning.avg_distance_to_ball_possession = round(
        agg.positioning.avg_distance_to_ball_possession / n, 1
    )
    agg.positioning.avg_distance_to_ball_no_possession = round(
        agg.positioning.avg_distance_to_ball_no_possession / n, 1
    )


@app.get("/api/stats/me")
async def stats_me() -> PlayerStats:
    config = await db.get_player_config()
    if not config.get("me"):
        raise HTTPException(400, "Player config not set. PUT /api/players/config first.")

    role_lookup = _build_role_lookup(config)
    replays = await db.all_replay_data()
    agg = AggregatedStats()

    for replay in replays:
        my_team = _find_my_team(replay, role_lookup)
        if not my_team:
            continue

        team = replay.get(my_team, {})
        opponent_team_color = "orange" if my_team == "blue" else "blue"
        my_team_goals = replay.get(my_team, {}).get("stats", {}).get("core", {}).get("goals", 0)
        opp_goals = (
            replay.get(opponent_team_color, {}).get("stats", {}).get("core", {}).get("goals", 0)
        )

        for player in team.get("players", []):
            if role_lookup.get(player.get("name", "").lower()) == "me":
                agg.games += 1
                if my_team_goals > opp_goals:
                    agg.wins += 1
                else:
                    agg.losses += 1
                _add_stats(agg, player.get("stats", {}))
                break  # Only count me once per replay

    _average_stats(agg)
    return PlayerStats(name="me", role="me", stats=agg)


@app.get("/api/stats/teammates")
async def stats_teammates() -> list[PlayerStats]:
    config = await db.get_player_config()
    if not config.get("me"):
        raise HTTPException(400, "Player config not set. PUT /api/players/config first.")

    role_lookup = _build_role_lookup(config)
    replays = await db.all_replay_data()

    # One aggregation per named teammate + one for anon
    teammate_names = list(config.get("teammates", {}).keys())
    buckets: dict[str, AggregatedStats] = {}
    for name in teammate_names:
        buckets[f"teammate:{name}"] = AggregatedStats()
    buckets["anon_teammate"] = AggregatedStats()

    for replay in replays:
        my_team = _find_my_team(replay, role_lookup)
        if not my_team:
            continue

        team = replay.get(my_team, {})
        opponent_team_color = "orange" if my_team == "blue" else "blue"
        my_team_goals = replay.get(my_team, {}).get("stats", {}).get("core", {}).get("goals", 0)
        opp_goals = (
            replay.get(opponent_team_color, {}).get("stats", {}).get("core", {}).get("goals", 0)
        )
        won = my_team_goals > opp_goals

        for player in team.get("players", []):
            role = _resolve_player_role(player.get("name", ""), True, role_lookup)
            if role == "me":
                continue
            bucket = buckets.get(role, buckets["anon_teammate"])
            bucket.games += 1
            if won:
                bucket.wins += 1
            else:
                bucket.losses += 1
            _add_stats(bucket, player.get("stats", {}))

    results = []
    for key, agg in buckets.items():
        _average_stats(agg)
        display_name = key.replace("teammate:", "") if key.startswith("teammate:") else key
        results.append(PlayerStats(name=display_name, role=key, stats=agg))
    return results


@app.get("/api/stats/opponents")
async def stats_opponents() -> PlayerStats:
    config = await db.get_player_config()
    if not config.get("me"):
        raise HTTPException(400, "Player config not set. PUT /api/players/config first.")

    role_lookup = _build_role_lookup(config)
    replays = await db.all_replay_data()
    agg = AggregatedStats()

    for replay in replays:
        my_team = _find_my_team(replay, role_lookup)
        if not my_team:
            continue

        opponent_color = "orange" if my_team == "blue" else "blue"
        opp_team = replay.get(opponent_color, {})
        my_team_goals = replay.get(my_team, {}).get("stats", {}).get("core", {}).get("goals", 0)
        opp_goals = opp_team.get("stats", {}).get("core", {}).get("goals", 0)

        for player in opp_team.get("players", []):
            agg.games += 1
            if opp_goals > my_team_goals:
                agg.wins += 1
            else:
                agg.losses += 1
            _add_stats(agg, player.get("stats", {}))

    _average_stats(agg)
    return PlayerStats(name="anon_opponent", role="anon_opponent", stats=agg)


@app.get("/api/stats/replays")
async def stats_replays(
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    config = await db.get_player_config()
    role_lookup = _build_role_lookup(config)
    replays = await db.list_replays(limit=limit, offset=offset)
    results = []

    for replay in replays:
        my_team = _find_my_team(replay, role_lookup)
        players = []
        for color in ("blue", "orange"):
            team = replay.get(color, {})
            is_my_team = color == my_team
            for player in team.get("players", []):
                role = _resolve_player_role(player.get("name", ""), is_my_team, role_lookup)
                players.append(
                    ReplayPlayer(
                        name=player.get("name", "Unknown"),
                        role=role,
                        team=color,
                        stats=player.get("stats", {}),
                    )
                )

        blue = replay.get("blue", {})
        orange = replay.get("orange", {})
        results.append(
            {
                "id": replay["id"],
                "title": replay.get("title"),
                "map_name": replay.get("map_name"),
                "date": replay.get("date"),
                "duration": replay.get("duration"),
                "blue_goals": blue.get("stats", {}).get("core", {}).get("goals"),
                "orange_goals": orange.get("stats", {}).get("core", {}).get("goals"),
                "overtime": replay.get("overtime", False),
                "my_team": my_team,
                "players": [p.model_dump() for p in players],
            }
        )
    return results


# --- Maps ---


@app.get("/api/maps")
async def get_maps():
    return await client.get_maps()
