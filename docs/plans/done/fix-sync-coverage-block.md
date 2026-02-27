# Fix: Sync blocked by stale coverage check

## Context

When a user selects a date range (e.g. Jan 1-31) and clicks Start Sync, the preview correctly reports 117 replays found. But clicking Confirm does nothing — no sync runs, no error shown.

**Root cause**: `POST /api/sync` calls `db.find_covering_sync()` which checks if any completed sync_log entry's date bounds cover the requested range. Sync log entry #3 has bounds `2025-06-01` through `2026-02-26` (set via `actual_date_after`/`actual_date_before` tightening in `complete_sync_log`), so any sub-range gets blocked with `{"message": "Already synced"}` returned as a 200. The frontend treats any 200 as "sync started" and silently moves on.

The coverage check is **fundamentally flawed**: it assumes continuous coverage within the sync bounds, but replays can be uploaded retroactively to ballchasing.com for past dates. The `_do_sync` function already has `replay_exists()` to skip already-downloaded replays, making the coverage check redundant.

## Fix

### 1. Remove the coverage check from POST /api/sync (`server.py:124-129`)

Delete the `find_covering_sync` call and the early return. The `_do_sync` loop already skips replays that exist in the DB via `replay_exists()`, so re-syncing a range is safe and idempotent — it'll just skip everything already downloaded.

### 2. Remove `find_covering_sync` from `db.py:227-259`

Dead code after step 1.

### 3. Remove unused import in `server.py`

The `_to_utc` calls on lines 125-126 were only used for the coverage check. Remove them from the sync endpoint (keep `_to_utc` itself, it's used in `_do_sync`).

## Files

- `server.py` — remove coverage check block (lines 124-129)
- `db.py` — remove `find_covering_sync` function (lines 227-259)

## Verification

1. Start dev server (`./dev.sh`)
2. Open browser to localhost:3000, go to Sync
3. Select Jan 1-31 on calendar
4. Click Start Sync → should show "117 replays" preview
5. Click Confirm → sync should actually start and show running status with progress
6. Replays already in DB get skipped (replays_skipped count increases), new ones get fetched
