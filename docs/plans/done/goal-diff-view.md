# Goal Differential Analysis View

## Context

The scoreline view is too sparse — exact scores (7-8, 5-3, etc.) rarely repeat, so most rows have only 1-2 games. Grouping by goal differential (+3, +2, +1, 0, -1, etc.) consolidates data into denser, more meaningful buckets. A 4-2 win and a 5-3 win both go into the "+2" bucket.

## Approach

**No new backend endpoint.** The existing `getGameAnalysis()` returns per-game data with `my_goals`, `opp_goals`, and role stats. The new view aggregates this client-side by `my_goals - opp_goals`, averaging stats per role within each bucket. This matches how the scoreline view already fetches game data for its expandable rows.

## Files to Modify

1. **`frontend/src/views/goal-diff-view.ts`** (NEW) — Lit component for the view
2. **`frontend/src/views/analysis-view.ts`** — Add sub-nav tab + route
3. **`docs/SPEC.md`** — Document the new sub-view

## Implementation Steps

### 1. Create `goal-diff-view.ts`

New Lit component following the exact pattern of `scoreline-view.ts`:

- Fetches game data via `getGameAnalysis(params)` (reuse existing API function, no new endpoint)
- Groups games by `my_goals - opp_goals` into buckets
- Each bucket row: Goal Diff label (e.g. "+3", "0", "-2"), Games count, three stat bar columns
- Averages `pbb`/`spd`/`dist` per role within each bucket (same averaging as scoreline endpoint does server-side)
- Expandable rows — click to show individual games in that bucket (same sub-row pattern as scoreline view)
- Sorted by goal diff descending (biggest wins first) by default
- Same shared filter/sort/bar rendering from `analysis-shared.ts`
- Row styling: `rowClass` based on diff sign (positive=win, zero=draw, negative=loss)

### 2. Wire into `analysis-view.ts`

- Add `'goal-diff'` to `SubView` type and `VALID_SUBS` array
- Import `./goal-diff-view.js`
- Add sub-nav button labeled "Win/Loss" between "Per Scoreline" and "Per Game"
- Add render branch for the new view

### 3. Update `docs/SPEC.md`

Add the new sub-view description under "Analysis Sub-Views" section.

## Verification

- `./dev.sh` to start backend+frontend
- Navigate to Analysis tab, confirm new sub-nav button appears
- Click it, verify rows grouped by goal differential with correct game counts
- Expand rows, verify individual games appear
- Toggle team size / playlists / filters — data updates correctly
- URL params persist across navigation
- Sum of games across all goal-diff rows should equal total games in Per Game view
