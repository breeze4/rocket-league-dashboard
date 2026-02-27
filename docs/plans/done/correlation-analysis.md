# Correlation Analysis Sub-View

## Context

The Analysis tab currently has two sub-views: Per Scoreline and Per Game. Both show 3 hardcoded stats (% behind ball, avg speed, avg distance to ball) in bar-chart table format. The user wants a deeper analysis tool — a "Correlations" sub-view that shows how any selectable stat correlates with winning/losing, using proper D3.js charts (scatter plot + bucket bar chart).

## Approach

**New backend endpoint** computes correlation data server-side (buckets, regression, individual points). **New frontend component** renders two D3.js charts: a scatter plot with trend line and a bucket bar chart showing win rate per stat range.

The user picks a stat from a dropdown, and the charts update to show how that stat relates to match outcome.

## Backend

### New endpoint: `GET /api/stats/correlation`

**Query params:**
- `stat` (required) — which stat to analyze (e.g., `percent_behind_ball`, `avg_speed`, `bpm`, `saves`, etc.)
- `role` — whose stat: `me` (default), `teammates`, `opponents`
- `team-size`, `exclude-zero-zero`, `min-duration`, `playlist` — same filters as existing endpoints

**Response model:**

```
CorrelationResponse:
  stat: str
  role: str
  games: int
  points: list[CorrelationPoint]    # individual game data for scatter plot
  buckets: list[CorrelationBucket]  # binned win rates for bar chart
  regression: RegressionLine        # trend line coefficients

CorrelationPoint:
  stat_value: float
  goal_diff: int          # my_goals - opp_goals (Y axis for scatter)
  won: bool

CorrelationBucket:
  range_min: float
  range_max: float
  label: str              # e.g., "25-30%"
  games: int
  wins: int
  losses: int
  draws: int
  win_rate: float         # wins / games

RegressionLine:
  slope: float
  intercept: float
  r_squared: float        # goodness of fit
```

**Stat extraction logic:** Reuses the same replay iteration pattern as `stats_games()`. Instead of extracting 3 hardcoded stats, extracts a single stat based on the `stat` parameter. Map of stat names to paths:

```
percent_behind_ball   -> stats.positioning.percent_behind_ball
avg_speed             -> stats.movement.avg_speed
avg_distance_to_ball  -> stats.positioning.avg_distance_to_ball
bpm                   -> stats.boost.bpm
avg_boost_amount      -> stats.boost.avg_amount
amount_stolen         -> stats.boost.amount_stolen
percent_zero_boost    -> stats.boost.percent_zero_boost
percent_full_boost    -> stats.boost.percent_full_boost
time_supersonic       -> stats.movement.time_supersonic_speed
time_slow_speed       -> stats.movement.time_slow_speed
saves                 -> stats.core.saves
shots                 -> stats.core.shots
shooting_pct          -> stats.core.shooting_percentage
score                 -> stats.core.score
demos_inflicted       -> stats.demo.inflicted
demos_taken           -> stats.demo.taken
time_defensive_third  -> stats.positioning.time_defensive_third
time_offensive_third  -> stats.positioning.time_offensive_third
```

**Bucketing:** ~8-10 equal-width buckets across the observed stat range. For percentage stats (0-100), use fixed 10% buckets.

**Regression:** Simple least-squares linear regression (stat_value vs goal_diff). Compute slope, intercept, r-squared. No numpy needed — straightforward arithmetic.

### Files to modify
- `server.py` — new endpoint, stat extraction map, bucketing + regression logic
- `models.py` — new response models (CorrelationResponse, CorrelationPoint, CorrelationBucket, RegressionLine)

## Frontend

### D3.js Setup

Install `d3` + `@types/d3` in frontend/. Import selectively (`d3-selection`, `d3-scale`, `d3-axis`, `d3-shape`, `d3-array`) to keep bundle small.

### New component: `correlation-view.ts`

**Layout (top to bottom):**
1. Shared filter bar (team size toggle, playlist filter, exclude 0-0, exclude short) — reuse from `analysis-shared.ts`
2. Stat selector dropdown + role selector (me/teammates/opponents)
3. Summary line: "N games | r² = 0.XX | Win rate: XX%"
4. Two charts side by side (flex row, each ~50% width):
   - **Left: Scatter plot** — X = stat value, Y = goal differential. Dots colored green (win) / red (loss) / gray (draw). Trend line overlay. Axis labels.
   - **Right: Bucket bar chart** — X = stat range buckets, Y = win rate (0-100%). Bars colored on a green-red gradient based on win rate. Game count label on each bar.

**D3 integration with Lit:**
- Declare `<svg>` elements in the Lit template
- In `updated()`, use `d3.select(this.renderRoot.querySelector('svg.scatter'))` to bind D3 rendering
- Clear and redraw when data changes (stat selection, filters)

**Stat dropdown options** grouped by category:
- Positioning: % Behind Ball, Avg Distance to Ball, Time Defensive Third, Time Offensive Third
- Movement: Avg Speed, Time Supersonic, Time Slow Speed
- Boost: BPM, Avg Boost Amount, Boost Stolen, % Zero Boost, % Full Boost
- Core: Score, Shots, Saves, Shooting %
- Demo: Demos Inflicted, Demos Taken

### Integration with Analysis tab

Update `analysis-view.ts`:
- Add `'correlation'` to the `SubView` type union
- Add third button "Correlations" in the sub-nav
- Import and render `<correlation-view>` when selected

### New API function in `api.ts`

Add `getCorrelationStats(params): Promise<CorrelationResponse>` plus TypeScript interfaces for the response types.

### Files to create
- `frontend/src/views/correlation-view.ts`

### Files to modify
- `frontend/src/views/analysis-view.ts` — add third sub-view
- `frontend/src/lib/api.ts` — new types + API function
- `frontend/package.json` — add d3 dependencies

## Implementation Checklist

- [x] 1. Add D3 dependencies: `npm install d3 @types/d3` in frontend/
- [x] 2. Add backend models: `CorrelationPoint`, `CorrelationBucket`, `RegressionLine`, `CorrelationResponse` to `models.py`
- [x] 3. Add `/api/stats/correlation` endpoint to `server.py` — stat extraction, bucketing, regression
- [x] 4. Add frontend types + `getCorrelationStats()` to `api.ts`
- [x] 5. Create `correlation-view.ts` — component with filters, stat dropdown, D3 scatter + bucket charts, summary stats
- [x] 6. Wire into `analysis-view.ts` — add "Correlations" button + conditional render
- [x] 7-10. All chart rendering, summary, tooltips implemented in correlation-view.ts

## Verification

1. Run backend + frontend: `./dev.sh`
2. Hit `/api/stats/correlation?stat=percent_behind_ball&team-size=2` — verify response shape
3. Navigate to Analysis > Correlations — verify charts render
4. Change stat dropdown — verify charts update
5. Change team size / playlist filters — verify data refreshes
6. Verify scatter dots are green/red, trend line visible, r² displayed
7. Verify bucket bars show meaningful win rate variation
8. Run `pytest` — verify no regressions
