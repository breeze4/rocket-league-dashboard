# Calendar Navigation: Browse Any Month/Year

## Context

The sync calendar currently auto-calculates visible months from the earliest data (or 3 months ago) through the current month. There's no way to navigate further back in time to view coverage or run syncs for older date ranges. The calendar just renders every month in that range as a flat list.

## Approach

Add paginated month navigation to the calendar. Show a fixed window of months at a time with prev/next controls. User can page backwards and forwards through any time period.

**File:** `frontend/src/views/sync-view.ts` (only file changed)

## Checklist

- [x] 1. Add navigation state: `_viewYear` and `_viewMonth` tracking the first visible month in the window, plus a `MONTHS_PER_PAGE` constant (6). Default to `current month - MONTHS_PER_PAGE + 1` so the current month is the last visible month.

- [x] 2. Replace `_getCalendarMonths()` with a simple window calculation: generate `MONTHS_PER_PAGE` consecutive months starting from `_viewYear`/`_viewMonth`. No more data-driven bounds.

- [x] 3. Add navigation methods: `_prevPage()` shifts back by `MONTHS_PER_PAGE` months, `_nextPage()` shifts forward by `MONTHS_PER_PAGE`, `_goToToday()` resets to default (current month visible). Disable next when already showing current month.

- [x] 4. Render navigation bar above the calendar grid: `« Prev` button, a year/month label showing the visible range (e.g. "Sep 2025 — Feb 2026"), `Next »` button, and a `Today` button. Add CSS for the nav bar (flex row, centered, matches existing dark theme).

## Verification

1. `./dev.sh`, open Sync tab
2. Calendar shows 6 months ending at current month by default
3. Click Prev — jumps back 6 months, shows older months (all "not synced" if no data)
4. Click Prev repeatedly — can go back years
5. Click Next — comes forward
6. Click Today — returns to default view with current month visible
7. Next button disabled when current month is already showing
8. Calendar day clicks, date selection, sync still work as before
9. Coverage colors still render correctly for months that have data
