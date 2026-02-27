# Analysis Subscreens: Per Scoreline + Per Game

## Goal

Split the Analysis tab into two sub-views with consistent styling and DRY code:
- **Per Scoreline** (existing) — aggregated stats grouped by final score
- **Per Game** — individual game stats in chronological order, sortable by date and stats

Both views display the same three bar-chart stats (% Behind Ball, Avg Speed, Avg Distance) with Me/Tm/Op breakdown and the same team-size filter (1s/2s/3s).

## Backend

### New endpoint: `GET /api/stats/games`

Returns per-game analysis rows with the same role stats shape used by scoreline.

Query params: `team-size` (optional, 1/2/3)

Response shape (reuses `ScorelineRoleStats` model):
```
GameAnalysisRow:
  id: str
  date: str
  my_goals: int
  opp_goals: int
  map_name: str | null
  overtime: bool
  me: ScorelineRoleStats
  teammates: ScorelineRoleStats | null
  opponents: ScorelineRoleStats
```

Logic: iterate replays, find my team, extract pbb/spd/dist per player, average teammates together, average opponents together. "me" is a single player so no averaging needed for that role.

## Frontend

### Extract shared analysis utilities

Pull these out of `scoreline-view.ts` into a new `frontend/src/lib/analysis-shared.ts`:
- Table/bar CSS (as a `css` tagged template that both views adopt)
- `rankColor(t, alpha)` function
- `computeGlobalRanges(rows)` function
- `renderBarCell(row, stat, globalRanges)` render helper
- Sort header render helpers
- Mode bar (team size selector) render helper

### New component: `game-analysis-view.ts`

Same structure as scoreline-view but:
- Fetches from `/api/stats/games`
- Columns: Date, Score, % Behind Ball, Avg Speed, Avg Distance (no "Games" column)
- Default sort: date descending
- Sortable by: date, score, pbb, spd, dist
- Date column shows formatted date (e.g. "Feb 15, 2:30 PM")

### Refactor `scoreline-view.ts`

Import shared utilities instead of defining them inline. No behavior change.

### Analysis tab sub-navigation

Add a secondary nav bar within the Analysis tab to switch between "Scoreline" and "Per Game". Two approaches:
- **Option A**: `analysis-view.ts` wrapper component with sub-nav that renders either `<scoreline-view>` or `<game-analysis-view>`
- **Option B**: Use sub-routes (`/analysis/scoreline`, `/analysis/games`) with the app-shell handling it

Going with Option A — simpler, no routing changes needed. The wrapper just toggles which child component renders.

## Checklist

- [ ] 1. Add `GameAnalysisRow` model to `models.py`
- [ ] 2. Add `GET /api/stats/games` endpoint to `server.py` (same pattern as scoreline but per-game, no aggregation across games)
- [ ] 3. Add `getGameAnalysis()` API function and `GameAnalysisRow` type to `frontend/src/lib/api.ts`
- [ ] 4. Extract shared analysis CSS and utilities from `scoreline-view.ts` into `frontend/src/lib/analysis-shared.ts`
- [ ] 5. Refactor `scoreline-view.ts` to import from `analysis-shared.ts` — verify no behavior change
- [ ] 6. Create `frontend/src/views/game-analysis-view.ts` using shared utilities
- [ ] 7. Create `frontend/src/views/analysis-view.ts` wrapper with sub-nav toggling between scoreline and game views
- [ ] 8. Update `app-shell.ts` to render `<analysis-view>` instead of `<scoreline-view>` for the analysis tab
