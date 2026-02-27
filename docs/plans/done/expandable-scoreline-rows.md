# Expandable Scoreline Rows — Drill-Down to Per-Game View

## Context

The analysis page has "Per Scoreline" and "Per Game" as separate tabs. The user wants to click a scoreline row (e.g., 7-8) and have it expand inline to show the individual games with that exact scoreline, rendered with the same bar-chart format. This eliminates the need to mentally cross-reference between the two tabs.

No backend changes needed. The existing `/api/stats/games` endpoint returns all the per-game data we need.

## Approach

- Scoreline view fetches game data alongside scoreline data via `Promise.all`
- Clicking a row toggles expansion, showing sub-rows filtered to that scoreline
- Sub-rows reuse `renderBarCell` and shared utilities — same format as the Per Game tab
- Multiple rows can be expanded simultaneously
- Sub-rows sorted by date descending (no independent sort controls)
- Expansion state resets when team-size or filters change (data reloads)

## Files to Modify

- `frontend/src/views/scoreline-view.ts` — main changes (fetch, state, click handlers, sub-row rendering, CSS)
- `frontend/src/lib/analysis-shared.ts` — extract `formatDate` helper (currently private in `game-analysis-view.ts`)
- `frontend/src/views/game-analysis-view.ts` — import shared `formatDate` instead of private method
- `docs/SPEC.md` — document the feature

## Checklist

### 1. Extract `formatDate` to shared utilities
**File:** `analysis-shared.ts`, `game-analysis-view.ts`

Move `_formatDate` from `game-analysis-view.ts` into `analysis-shared.ts` as an exported `formatDate` function. Update `game-analysis-view.ts` to import and use it. No behavior change.

### 2. Add game data fetching to scoreline-view
**File:** `scoreline-view.ts`

- Import `getGameAnalysis` and `GameAnalysisRow` from `api.ts`
- Add `@state() _games: GameAnalysisRow[] = []`
- Change `_load()` to use `Promise.all([getScorelineStats(params), getGameAnalysis(params)])` and store both results
- No rendering changes yet — just data fetched silently alongside existing data

### 3. Add expand/collapse state and helpers
**File:** `scoreline-view.ts`

- Add `@state() _expanded = new Set<string>()`
- `_toggleExpand(my: number, opp: number)` — toggles key `"${my}-${opp}"` in the set
- `_isExpanded(my: number, opp: number): boolean`
- `_gamesForScoreline(my: number, opp: number): GameAnalysisRow[]` — filters `_games` by matching goals, sorted date descending
- Clear `_expanded` in `_load()` (when filters/team-size change, expansion resets)
- Add a computed getter `_gameGlobalRanges` that calls `computeGlobalRanges(this._games)` for sub-row bar scaling

### 4. Make scoreline rows clickable and render sub-rows
**File:** `scoreline-view.ts`

- Add `@click` on each scoreline `<tr>` calling `_toggleExpand`
- Add chevron indicator in the Games cell (Unicode arrow, rotates on expand)
- When expanded, render sub-rows after the parent `<tr>`:
  - Each sub-row: `<tr class="sub-row ${rowClass(...)}">`
  - Columns: Date (formatted), Score, 3x `renderBarCell` using `_gameGlobalRanges`
- Add `cursor: pointer` to parent rows

### 5. Style sub-rows
**File:** `scoreline-view.ts` (CSS block)

- `tr.sub-row` — darker background, indented left-border, slightly smaller text
- `tr.sub-row td.date` — left-aligned, muted gray (matching game-analysis-view style)
- Parent row with expanded children gets visual connection (e.g., no bottom border)
- Last sub-row in a group gets thicker bottom border to separate from next scoreline

### 6. Update spec
**File:** `docs/SPEC.md`

Add to the "Analysis Sub-Views" section: scoreline rows are expandable — clicking shows individual games inline with the same bar-chart rendering.

## Verification

1. Run `./dev.sh` and navigate to Analysis > Per Scoreline
2. Click a scoreline row — should expand to show individual games with that score
3. Verify bar charts render correctly in sub-rows (Me/Tm/Op bars with proper scaling)
4. Click again — should collapse
5. Expand multiple rows simultaneously
6. Change team size — expanded rows should reset
7. Switch to Per Game tab and back — verify no regressions
8. Check 1v1 mode — sub-rows should show 2 bars (Me/Op), no Tm bar
