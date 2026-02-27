from __future__ import annotations

import json
from datetime import datetime, timezone

import aiosqlite

DB_PATH = "ballchasing.db"


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS replays (
                id TEXT PRIMARY KEY,
                data JSON NOT NULL,
                date TEXT,
                map_name TEXT,
                playlist_name TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS player_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                config JSON NOT NULL DEFAULT '{}'
            )
        """)
        await db.execute("""
            INSERT OR IGNORE INTO player_config (id, config) VALUES (1, '{}')
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sync_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_after TEXT,
                date_before TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                replays_found INTEGER DEFAULT 0,
                replays_fetched INTEGER DEFAULT 0,
                replays_skipped INTEGER DEFAULT 0,
                error TEXT
            )
        """)
        await db.commit()


async def replay_exists(replay_id: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT 1 FROM replays WHERE id = ?", (replay_id,))
        return await cursor.fetchone() is not None


async def upsert_replay(replay_id: str, data: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO replays (id, data, date, map_name, playlist_name)
               VALUES (?, ?, ?, ?, ?)""",
            (
                replay_id,
                json.dumps(data),
                data.get("date"),
                data.get("map_name"),
                data.get("playlist_name"),
            ),
        )
        await db.commit()


async def get_replay(replay_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT data FROM replays WHERE id = ?", (replay_id,))
        row = await cursor.fetchone()
        if row:
            return json.loads(row[0])
        return None


async def list_replays(
    date_after: str | None = None,
    date_before: str | None = None,
    map_name: str | None = None,
    playlist: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict]:
    conditions = []
    params: list = []
    if date_after:
        conditions.append("date >= ?")
        params.append(date_after)
    if date_before:
        conditions.append("date <= ?")
        params.append(date_before)
    if map_name:
        conditions.append("map_name = ?")
        params.append(map_name)
    if playlist:
        conditions.append("playlist_name = ?")
        params.append(playlist)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    query = f"SELECT data FROM replays {where} ORDER BY date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [json.loads(row[0]) for row in rows]


async def count_replays() -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM replays")
        row = await cursor.fetchone()
        return row[0] if row else 0


async def all_replay_data() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT data FROM replays ORDER BY date DESC")
        rows = await cursor.fetchall()
        return [json.loads(row[0]) for row in rows]


async def get_player_config() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT config FROM player_config WHERE id = 1")
        row = await cursor.fetchone()
        if row:
            return json.loads(row[0])
        return {}


async def set_player_config(config: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE player_config SET config = ? WHERE id = 1",
            (json.dumps(config),),
        )
        await db.commit()


# --- Sync log ---


async def create_sync_log(date_after: str | None, date_before: str | None) -> int:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO sync_log (date_after, date_before, started_at, status)
               VALUES (?, ?, ?, 'running')""",
            (date_after, date_before, now),
        )
        await db.commit()
        return cursor.lastrowid  # type: ignore[return-value]


async def complete_sync_log(
    log_id: int,
    status: str,
    replays_found: int,
    replays_fetched: int,
    replays_skipped: int,
    error: str | None = None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """UPDATE sync_log
               SET completed_at = ?, status = ?,
                   replays_found = ?, replays_fetched = ?, replays_skipped = ?,
                   error = ?
               WHERE id = ?""",
            (now, status, replays_found, replays_fetched, replays_skipped, error, log_id),
        )
        await db.commit()


async def get_sync_history(limit: int = 20) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM sync_log ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def find_covering_sync(
    date_after: str | None, date_before: str | None
) -> dict | None:
    """Return a completed sync that fully covers the requested range, or None."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Build conditions: a covering sync has
        #   (sync.date_after IS NULL OR sync.date_after <= requested.date_after)
        #   AND (sync.date_before IS NULL OR sync.date_before >= requested.date_before)
        # If requested bound is NULL (unbounded), only a NULL sync bound covers it.
        conditions = []
        params: list = []

        if date_after is not None:
            conditions.append("(date_after IS NULL OR date_after <= ?)")
            params.append(date_after)
        else:
            conditions.append("date_after IS NULL")

        if date_before is not None:
            conditions.append("(date_before IS NULL OR date_before >= ?)")
            params.append(date_before)
        else:
            conditions.append("date_before IS NULL")

        where = " AND ".join(conditions)
        cursor = await db.execute(
            f"SELECT * FROM sync_log WHERE status = 'completed' AND {where} "
            "ORDER BY id DESC LIMIT 1",
            params,
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
