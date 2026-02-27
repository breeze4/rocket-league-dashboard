# Plan: Playlist filters for analysis page

## Context

The analysis endpoints iterate all replays regardless of game mode. Non-standard modes (Hoops, Dropshot, Rumble, SnowDay, Private) and casual playlists skew competitive analysis. Users need playlist filtering with sensible defaults.

DB query of actual data:
```
  703  Ranked Doubles
  319  Unranked Doubles
  246  Ranked Duels
   77  Ranked Standard
   55  None
   30  Ranked Hoops
   19  Unranked Standard
   15  Unranked Chaos
   12  Private
    4  Unranked Duels
    3  Ranked Dropshot
    2  Ranked Rumble
    1  SnowDay
    1  Rumble
```

## UI Design

The filter bar gets playlist checkboxes added between the mode bar and existing filter checkboxes:

```
[1s] [2s] [3s]                                        ← existing mode bar
☐ Ranked 1s  ☑ Ranked 2s  ☑ Ranked 3s                 ← new, Ranked 2s/3s checked by default
☐ Casual 1s  ☐ Casual 2s  ☐ Casual 3s                 ← new, unchecked by default
☐ Include all game modes                               ← new, unchecked; overrides above
☑ Exclude 0-0 games  ☑ Exclude games < 90s            ← existing filter bar
```

When "Include all game modes" is checked, the 6 individual playlist checkboxes are disabled (grayed out) and all replays pass the playlist filter.

## Playlist mapping

| Checkbox     | playlist_name values           |
|-------------|-------------------------------|
| Ranked 1s   | `"Ranked Duels"`              |
| Ranked 2s   | `"Ranked Doubles"`            |
| Ranked 3s   | `"Ranked Standard"`           |
| Casual 1s   | `"Unranked Duels"`            |
| Casual 2s   | `"Unranked Doubles"`          |
| Casual 3s   | `"Unranked Standard"`         |

Everything else only included when "Include all game modes" is checked.

## Changes

### 1. Backend: Add playlist filter param to both endpoints
**File**: `server.py`

Add to both `/api/stats/scoreline` and `/api/stats/games`:
- `playlist` (list[str], default empty) — if non-empty, skip replays whose `playlist_name` is not in this list

In the replay loop, early in the filter chain (before team-size), add:
- `if playlists and (replay.get("playlist_name") or "") not in playlists: continue`

Empty list = no filtering (backward compat + "include all" case).

### 2. Frontend API: Pass playlist param
**File**: `frontend/src/lib/api.ts`

Add `playlists?: string[]` to `AnalysisFilterParams`. In both API functions, append each value as a repeated `playlist` query param.

### 3. Frontend shared: Render playlist filter
**File**: `frontend/src/lib/analysis-shared.ts`

Add `renderPlaylistFilter()` that renders:
- 6 checkboxes in two rows (Ranked row, Casual row)
- "Include all game modes" checkbox
- When "Include all" is checked, disable the 6 individual checkboxes

Define the playlist name mapping as a constant here. Add CSS for layout and disabled state.

### 4. Frontend views: Add playlist filter state
**Files**: `frontend/src/views/scoreline-view.ts`, `frontend/src/views/game-analysis-view.ts`

In each view:
- Add `@state()` for each checkbox: `_ranked1s = true`, `_ranked2s = true`, `_ranked3s = true`, `_casual1s = false`, `_casual2s = false`, `_casual3s = false`, `_allModes = false`
- Compute `playlists` array from state (empty array when `_allModes` is true)
- Pass to API in `_load()`, re-load on any change
- Render `renderPlaylistFilter()` between mode bar and existing filter bar

## Verification

1. `./dev.sh`, open Analysis tab
2. Ranked 1s/2s/3s checked, Casual unchecked, "Include all" unchecked
3. Only ranked standard mode data visible
4. Check "Casual 2s" — casual doubles data appears
5. Check "Include all game modes" — all data appears, individual checkboxes disabled
6. Uncheck "Include all" — returns to previous checkbox state
7. Team-size selector, 0-0 filter, <90s filter all still work
8. `pytest` passes
