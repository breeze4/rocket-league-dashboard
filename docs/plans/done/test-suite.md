# Test Suite Plan

## Context

No tests exist. The backend has meaningful logic worth testing — stat aggregation, role resolution, date normalization, DB operations, and API endpoints. Frontend is Lit web components with minimal logic; testing those requires heavier infrastructure (web test runner, browser env) for less payoff. Backend-only test suite.

## Dependencies

Add to `requirements.txt`:
- `pytest`
- `pytest-asyncio`

Add `pytest.ini` (or section in a new `pyproject.toml`) for config:
- asyncio_mode = auto (so every async test just works)

## Structure

```
tests/
  conftest.py           — shared fixtures
  test_helpers.py       — pure function tests (no IO)
  test_db.py            — database layer tests
  test_api.py           — API endpoint integration tests
```

## Files to modify

- `requirements.txt` — add test deps
- New: `pytest.ini` — pytest config
- New: `tests/conftest.py`
- New: `tests/test_helpers.py`
- New: `tests/test_db.py`
- New: `tests/test_api.py`

## Fixtures (`conftest.py`)

- **`tmp_db`** — monkeypatch `db.DB_PATH` to a temp file, call `db.init_db()`, yield, cleanup. Scoped per-function for isolation.
- **`sample_replay`** — returns a realistic replay dict with blue/orange teams, player stats, etc. Reusable across DB and API tests.
- **`sample_config`** — returns a player config dict with me aliases and teammates.
- **`api_client`** — async httpx client mounted on the FastAPI app via `ASGITransport`. Patches `server.client` with a mock `BallchasingClient` so no real HTTP calls happen. Uses `tmp_db` for DB isolation.

## Test Plan

### Step 1: Add pytest deps + config
Add `pytest`, `pytest-asyncio` to `requirements.txt`. Create `pytest.ini` with `asyncio_mode = auto`.

### Step 2: Create `conftest.py` with fixtures
`tmp_db`, `sample_replay`, `sample_config` fixtures. The `sample_replay` fixture should have realistic nested structure matching what ballchasing.com returns (blue/orange teams with players, stats with core/boost/movement/positioning/demo).

### Step 3: Create `test_helpers.py` — pure function tests
Test the server.py helper functions directly (they're importable):
- `_build_role_lookup`: config with me aliases + teammates → correct lookup dict
- `_resolve_player_role`: known me, known teammate, unknown on my team, unknown on opponent team
- `_find_my_team`: finds blue, finds orange, returns None when no match
- `_safe_get`: normal nested access, missing keys, non-dict intermediate
- `_add_stats`: accumulates correctly into AggregatedStats
- `_average_stats`: divides correctly, handles zero games, calculates shooting_percentage
- `_normalize_date`: date-only → full timestamp, already has T → passthrough, None → None
- `_to_utc`: converts timezone-aware ISO to UTC Z-suffix

### Step 4: Create `test_db.py` — database layer tests
All use `tmp_db` fixture:
- `init_db` creates tables (idempotent)
- `upsert_replay` + `get_replay` roundtrip
- `replay_exists` true/false
- `list_replays` with date/map/playlist filters, ordering, limit/offset
- `count_replays`
- `get_player_config` / `set_player_config` roundtrip
- `create_sync_log` / `complete_sync_log` / `get_sync_history`
- `get_replay_date_counts` grouping
- `find_covering_sync` coverage logic

### Step 5: Create `test_api.py` — API endpoint tests
Add `api_client` fixture to conftest. Tests:
- `GET /api/sync/status` returns default status
- `GET /api/players` returns frequency list from inserted replays
- `PUT /api/players/config` + `GET /api/players/config` roundtrip
- `GET /api/replays` returns summaries
- `GET /api/replays/{id}` returns detail, 404 on missing
- `GET /api/stats/me` returns aggregated stats (needs config + replays)
- `GET /api/stats/me` returns 400 when no config set
- `GET /api/stats/scoreline` returns grouped rows
- `GET /api/stats/games` returns per-game rows with team-size filter

### Step 6: Install deps and verify all tests pass
`pip install pytest pytest-asyncio && pytest -v`

## Design Decisions

- **Monkeypatch `db.DB_PATH`** rather than making it configurable — no production code changes needed for testability.
- **`asyncio_mode = auto`** — avoids decorating every test with `@pytest.mark.asyncio`.
- **No mocking of db functions in API tests** — let them hit the real (temp) SQLite. The DB is fast and this catches integration bugs.
- **Mock only the external HTTP client** (`BallchasingClient`) since we don't want real network calls.
- **No frontend tests** — Lit components need JSDOM/browser runtime and the logic is mostly in the backend.
