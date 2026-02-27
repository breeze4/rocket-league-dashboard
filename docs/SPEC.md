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
/api/sync/coverage            -> GET: replay counts per day + completed sync date ranges

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

/api/stats/scoreline          -> GET: scoreline analysis — per-scoreline averages for positioning/speed
```

## Scoreline Analysis

The `/api/stats/scoreline` endpoint buckets all replays by normalized scoreline (my_goals-opp_goals, with "my team" always on the left). For each scoreline, it computes per-role averages (me, teammates, opponents) for:

- `percent_behind_ball` — from `stats.positioning.percent_behind_ball`
- `avg_speed` — from `stats.movement.avg_speed`
- `avg_distance_to_ball` — from `stats.positioning.avg_distance_to_ball`

Rows are sorted by goal differential descending (biggest wins first), then by my_goals descending. The frontend "Analysis" tab renders this as a table with green-tinted win rows and red-tinted loss rows.

### Team Size Filter

The scoreline endpoint accepts an optional `team-size` query parameter (1, 2, or 3). When provided, only replays matching that team size are included (determined by `max(len(blue.players), len(orange.players))`). For 1v1 (`team-size=1`), the `teammates` field is omitted from the response (null) and the frontend renders only Me/Op bars instead of Me/Tm/Op. The frontend defaults to 2s and provides a segmented control (1s | 2s | 3s) above the table.

### Analysis Sub-Views

The Analysis tab has two sub-views, toggled via a secondary nav within the tab:

**Per Scoreline** — The existing scoreline aggregation view. Groups replays by final score and averages positioning/speed stats per role.

**Per Game** — Individual game stats shown chronologically (most recent first). Each row is a single replay with the same three bar-chart stats (% Behind Ball, Avg Speed, Avg Distance) broken down by Me/Tm/Op. Columns: Date, Score, plus the three stat bar columns. Sortable by date, score, or any stat column. Uses the same team-size filter.

Both views share styling, bar rendering, color ranking, and sort logic via shared utilities to keep code DRY.

`GET /api/stats/games?team-size=N` — Returns per-game analysis rows. Each row contains `id`, `date`, `my_goals`, `opp_goals`, `map_name`, `overtime`, and `ScorelineRoleStats` for me/teammates/opponents. For "me" these are the raw per-player values (no averaging). For teammates and opponents, values are averaged across the team's players.

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

## Frontend Routing

Custom History API router (no library). The dev server uses `historyApiFallback` so direct URL loads work.

### Routes

```
/              → redirect to /sync
/sync          → sync view
/players       → players view
/stats         → stats view
/analysis      → scoreline analysis view
/replays       → replays list
/replays/:id   → replay detail
```

Tab clicks call `navigate(path)` which pushes state and dispatches a `route-changed` event. The app shell reads the route on load and on `route-changed` / `popstate` to sync the active tab and subroute. Unknown paths redirect to `/sync`.
