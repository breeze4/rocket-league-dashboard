# API Usage Tracker

## Context
The ballchasing client uses a client-side token bucket for rate limiting but provides no visibility into current usage. Adding a tracker to the sync page lets the user see how close they are to hitting rate limits, especially during long syncs.

## Files to modify
- `ballchasing_client.py` — expose bucket state
- `models.py` — add response model
- `server.py` — add endpoint
- `frontend/src/lib/api.ts` — add fetch helper + type
- `frontend/src/views/sync-view.ts` — display widget
- `docs/SPEC.md` — document the feature

## Plan

### 1. Add `snapshot()` method to `TokenBucket`
Returns a dict with: `per_second`, `tokens_available`, `per_hour` (or null), `hour_used`, `hour_remaining`, `seconds_until_hour_reset`.

### 2. Add `rate_limit_status()` to `BallchasingClient`
Returns `{"tier": str, "list": <snapshot>, "get": <snapshot>}` by calling `snapshot()` on both buckets. Store the tier string on the client instance.

### 3. Add `RateLimitStatus` pydantic model to `models.py`
Model the response shape for the endpoint.

### 4. Add `GET /api/rate-limits` endpoint in `server.py`
Calls `client.rate_limit_status()`, returns the model. No upstream API call — just reads local bucket state.

### 5. Add `fetchRateLimits()` to `api.ts` and the response type
Simple GET call, typed response.

### 6. Add rate limit display to the sync view
Show a compact section near the top of the sync page with:
- Tier name
- List bucket: `X/Y per hour` with a usage bar
- Get bucket: `X/Y per hour` with a usage bar
- For tiers with no hourly limit (GC/Champion), show "unlimited"
- Auto-refresh: poll alongside the existing sync status poll (every 1s during sync, otherwise on page load)

### 7. Update spec
Add brief section about the rate limit display.

## Verification
- Run `./dev.sh` and navigate to sync page
- Confirm the rate limit section appears with correct tier and limits
- Start a sync, confirm the hourly counters tick up in real time
- Check with a tier that has no hourly limit (set env to "gc") to confirm "unlimited" display
