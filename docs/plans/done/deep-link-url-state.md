# Deep-link Filter State via URL Parameters

## Context

All frontend filter/view state is ephemeral — component-local `@state()` properties that reset on reload. The user wants to bookmark or share exact views (filters, sub-pages, pagination) via URL alone.

## URL Scheme

**Paths** (existing + new sub-path):
```
/sync
/players
/stats
/analysis/scoreline   (was just /analysis with local sub-state)
/analysis/games
/analysis/correlation
/replays
/replays/:id
```

**Query params** (analysis views — short keys to keep URLs compact):
| Param | Meaning | Default | Values |
|-------|---------|---------|--------|
| `ts`  | teamSize | `2` | `1`, `2`, `3` |
| `ez`  | excludeZeroZero | `1` | `0`, `1` |
| `es`  | excludeShort | `1` | `0`, `1` |
| `pl`  | playlist keys | `ranked2s,ranked3s` | comma-separated PLAYLIST_OPTIONS keys |
| `all` | allModes | `0` | `0`, `1` |
| `sort`| sort column | view-specific | `score`,`games`,`date`,`pbb`,`spd`,`dist` |
| `dir` | sort direction | view-specific | `asc`, `desc` |
| `stat`| correlation stat | `percent_behind_ball` | stat value strings |
| `role`| correlation role | `me` | `me`,`teammates`,`opponents` |

**Replays**:
| Param | Meaning | Default |
|-------|---------|---------|
| `p`   | page (1-based) | `1` |

## Key Decisions

- **`replaceState` for filter changes** — don't pollute browser history with every toggle. Only path changes (tab/sub-tab navigation) use `pushState`.
- **Filters persist across analysis sub-tabs** — switching from scoreline to games preserves `?ts=3&ez=0` etc. since sub-tab clicks navigate with current search params.
- **Default params are omitted from URL** — only non-default values appear, keeping URLs clean.

## Files Modified

- `frontend/src/lib/router.ts` — add query param helpers
- `frontend/src/app-shell.ts` — pass `sub` prop to analysis-view
- `frontend/src/views/analysis-view.ts` — read sub from prop, navigate with search params
- `frontend/src/lib/analysis-shared.ts` — shared URL-to-filter-state helpers
- `frontend/src/views/scoreline-view.ts` — read/write URL params
- `frontend/src/views/game-analysis-view.ts` — read/write URL params
- `frontend/src/views/correlation-view.ts` — read/write URL params
- `frontend/src/views/replays-view.ts` — page param in URL
- `docs/SPEC.md` — document new URL scheme

## Implementation Steps

### 1. Add URL param helpers to router.ts
Add to `router.ts`:
- `getSearchParams()`: returns `URLSearchParams` from `location.search`
- `replaceSearchParams(updates: Record<string, string | null>)`: merges updates into current params, removes null entries, calls `history.replaceState`
- Update `navigate()` to preserve or accept query strings in the path argument

### 2. Wire analysis sub-view to URL path
- `app-shell.ts`: pass `sub` to analysis-view: `<analysis-view .sub=${this._sub}></analysis-view>`
- `analysis-view.ts`: add `@property() sub: string | null` replacing `@state() _subView`
- Default to `'scoreline'` when `sub` is null
- Sub-nav buttons call `navigate('/analysis/xxx' + location.search)` to preserve filters
- When `sub` is null on mount, redirect to `/analysis/scoreline` (preserving any query params)

### 3. Add shared filter URL read/write to analysis-shared.ts
Add functions:
- `readFiltersFromURL()`: returns `{ teamSize, excludeZeroZero, excludeShort, playlistState, allModes }` parsed from current URL params, falling back to defaults
- `writeFiltersToURL(filters)`: calls `replaceSearchParams` with the filter values, omitting params that match defaults to keep URLs clean
- `playlistStateToKeys(state)` / `keysToPlaylistState(keys)` for serializing playlist checkbox state to/from comma-separated URL string

### 4. Update scoreline-view for URL params
- In `connectedCallback`, read filters + sort from URL via helpers
- On every filter/sort change, update URL via `writeFiltersToURL()` before calling `_load()`
- Listen for `popstate`/`route-changed` to re-read params (back/forward support)
- Clean up listener in `disconnectedCallback`

### 5. Update game-analysis-view for URL params
Same pattern as step 4. Default sort: `date`/`desc`.

### 6. Update correlation-view for URL params
Same shared filters plus additional `stat` and `role` params read/written to URL.

### 7. Update replays-view for URL pagination
- Read `p` param (1-based page number) to compute `_offset`
- On page change, call `replaceSearchParams({ p: pageNum })` (omit `p` when page is 1)
- Back/forward works for pagination

### 8. Update SPEC.md
Add deep-linking documentation to the Frontend Routing section.

## Verification

1. Load `/analysis/scoreline?ts=3&ez=0&pl=ranked1s` — should show 3v3 with only ranked 1s, zero-zero included
2. Change team size to 2 — URL updates to `?ts=2&ez=0&pl=ranked1s` without page reload
3. Click "Per Game" sub-tab — URL changes to `/analysis/games?ts=2&ez=0&pl=ranked1s` (filters preserved)
4. Hit browser back — returns to `/analysis/scoreline?ts=2&ez=0&pl=ranked1s`
5. Copy URL, paste in new tab — exact same view loads
6. Navigate to `/replays?p=2` — shows second page
7. Navigate to `/analysis` (no sub) — redirects to `/analysis/scoreline`
8. All defaults produce clean URL: `/analysis/scoreline` (no query params)
