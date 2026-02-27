# Ballchasing Replay Stats Server

## Overview

FastAPI server that pulls Rocket League replay data from ballchasing.com, caches it locally in SQLite, and provides player-aware stat aggregation.

## Architecture

Two-phase workflow:

**Phase 1: Sync** — Pull all replays from ballchasing for a time period, cache full replay details locally in SQLite.

**Phase 2: Analyze** — Query the local cache. Identify players by frequency/name, map them to roles (me, teammate_1/2/3, anon_teammate, anon_opponent), aggregate stats.

## API Routes

```
/api/ping                     -> verify API key
/api/sync                     -> POST: pull replays from ballchasing, cache in SQLite
/api/sync/status              -> GET: sync progress
/api/sync/history             -> GET: list recent sync log entries

/api/players                  -> GET: list all players seen, sorted by frequency
/api/players/config           -> GET/PUT: map player names to roles

/api/stats/me                 -> GET: aggregated stats for "me" across all names
/api/stats/teammates          -> GET: stats for each named teammate + anon aggregate
/api/stats/opponents          -> GET: anonymous aggregated opponent stats
/api/stats/replays            -> GET: per-replay breakdown with player roles resolved

/api/replays                  -> GET: list cached replays with filters
/api/replays/{id}             -> GET: single replay detail from cache
/api/maps                     -> GET: proxy to ballchasing /api/maps

/ (static)                    -> future frontend
```

## Player Identity Model

After initial sync, the user hits `/api/players` to see every player name that appears in their replays, sorted by appearance count. The user (appearing most, under multiple names) will be obvious. Their 3 teammates will also be high-frequency.

The user then configures via `/api/players/config`:
```json
{
  "me": ["name1", "name2", "name3"],
  "teammates": {
    "alice": ["Alice", "alice_alt"],
    "bob": ["Bob"],
    "charlie": ["Charlie", "charlie_v2"]
  }
}
```

Anyone not in "me" or "teammates" who was on the same team = "anon_teammate". All opponents = "anon_opponent". Config stored in SQLite.

## Rate Limiting

Client-side token-bucket per endpoint group so we never 429. Tier from `.env` (`BALLCHASING_TIER`, default `gold`).

| Endpoint Group | GC | Champion | Diamond | Gold | Regular |
|---|---|---|---|---|---|
| List replays/groups | 16/s | 8/s | 4/s, 2000/hr | 2/s, 1000/hr | 2/s, 500/hr |
| Get replay/group | 16/s | 8/s | 4/s, 5000/hr | 2/s, 2000/hr | 2/s, 1000/hr |

## Key Decisions

- httpx async client
- SQLite for local cache (single file, easy to reset)
- python-dotenv for .env
- CORS enabled for future frontend
- Read-only proxy — no upload/delete/patch
- Sync is incremental — skip replays already cached
- Sync history tracked in `sync_log` table — prevents redundant API calls for already-fetched date ranges

## Sync History

The `sync_log` table records every sync attempt with date range, status, and replay counts. Before starting a new sync, the server checks whether a previous completed sync already covers the requested date range. If so, the sync is skipped and the covering entry is returned.

### Table: `sync_log`

Columns: `id`, `date_after`, `date_before`, `started_at`, `completed_at`, `status` (running/completed/failed), `replays_found`, `replays_fetched`, `replays_skipped`, `error`.

### Coverage logic

A completed sync covers a requested range `[A, B]` if `sync.date_after <= A` (or sync bound is NULL = unbounded) AND `sync.date_before >= B` (or sync bound is NULL).

### API

```
/api/sync/history            -> GET: list recent sync log entries (default limit 20)
```

The `POST /api/sync` endpoint now returns `{"message": "Already synced", "covered_by": {...}}` if a covering sync exists, without making any API calls to ballchasing.
