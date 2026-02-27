# Plan: Analysis page filters for 0-0 games and short games

## Context

The analysis page (both Per Scoreline and Per Game views) shows all replays without any way to exclude noise. 0-0 games (forfeits/disconnects) and games under 90 seconds (also likely incomplete) skew the stats. Adding checkboxes to exclude these, checked by default, gives cleaner analysis out of the box.

## Approach

Filter on the backend (same pattern as the existing team-size filter — a `continue` in the replay loop). Add two boolean query params to both endpoints, pass them from the frontend, and render shared checkboxes in the UI.

## Changes

### 1. Backend: Add filter params to both endpoints
**File**: `server.py`

Add query params to both `/api/stats/scoreline` and `/api/stats/games`:
- `exclude-zero-zero` (bool, default `false`) — skip replays where both teams scored 0
- `min-duration` (int, default `0`) — skip replays shorter than this many seconds

In the replay loop of each endpoint, after the existing team-size filter block (~lines 598-603 and 698-703), add:
- Duration check: `if min_duration and (replay.get("duration") or 0) < min_duration: continue`
- 0-0 check: after computing `my_goals`/`opp_goals`, `if exclude_zero_zero and my_goals == 0 and opp_goals == 0: continue`

Note: the 0-0 check goes after `my_goals`/`opp_goals` are computed (lines 605-606 and 705-706). The duration check can go earlier with the team-size filter.

### 2. Frontend API: Pass new params
**File**: `frontend/src/lib/api.ts`

Update `getScorelineStats()` and `getGameAnalysis()` to accept and forward `exclude-zero-zero` and `min-duration` query params. Add them as additional function parameters.

### 3. Frontend views: Add filter state and checkboxes
**Files**: `frontend/src/views/scoreline-view.ts`, `frontend/src/views/game-analysis-view.ts`

In each view:
- Add `@state()` properties: `_excludeZeroZero = true`, `_excludeShort = true`
- Pass these to the API call in `_load()`
- On checkbox change, toggle the state and call `_load()`

### 4. Frontend shared: Render filter checkboxes
**File**: `frontend/src/lib/analysis-shared.ts`

Add a `renderFilterBar()` function that renders two checkboxes with labels:
- "Exclude 0-0 games"
- "Exclude games < 90s"

Add minimal checkbox styling to `analysisStyles`. Render the filter bar alongside the existing mode bar in both views.

## Verification

1. `./dev.sh`, open Analysis tab
2. Both checkboxes visible and checked by default
3. Uncheck "Exclude 0-0" — 0-0 scoreline row appears (Per Scoreline), 0-0 games appear (Per Game)
4. Uncheck "Exclude < 90s" — short games appear
5. Team-size selector still works independently
6. `pytest` — existing tests pass
