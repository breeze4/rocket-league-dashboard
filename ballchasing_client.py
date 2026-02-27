from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

import httpx

BASE_URL = "https://ballchasing.com/api"

# Rate limits by tier: (per_second, per_hour or None)
RATE_LIMITS: dict[str, dict[str, tuple[float, int | None]]] = {
    "gc":       {"list": (16, None),  "get": (16, None)},
    "champion": {"list": (8, None),   "get": (8, None)},
    "diamond":  {"list": (4, 2000),   "get": (4, 5000)},
    "gold":     {"list": (2, 1000),   "get": (2, 2000)},
    "regular":  {"list": (2, 500),    "get": (2, 1000)},
}


@dataclass
class TokenBucket:
    per_second: float
    per_hour: int | None = None
    _tokens: float = field(init=False)
    _last_refill: float = field(init=False)
    _hour_tokens: int = field(init=False, default=0)
    _hour_start: float = field(init=False)
    _lock: asyncio.Lock = field(init=False, default_factory=asyncio.Lock)

    def __post_init__(self) -> None:
        self._tokens = self.per_second
        self._last_refill = time.monotonic()
        self._hour_tokens = 0
        self._hour_start = time.monotonic()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.per_second, self._tokens + elapsed * self.per_second)
        self._last_refill = now

        if (now - self._hour_start) >= 3600:
            self._hour_tokens = 0
            self._hour_start = now

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                self._refill()

                if self.per_hour is not None and self._hour_tokens >= self.per_hour:
                    wait = 3600 - (time.monotonic() - self._hour_start)
                    if wait > 0:
                        await asyncio.sleep(min(wait, 60))
                        continue

                if self._tokens >= 1:
                    self._tokens -= 1
                    self._hour_tokens += 1
                    return

            await asyncio.sleep(1.0 / self.per_second)

    def seed_usage(self, hour_used: int) -> None:
        """Initialize hourly counter from persisted data after restart."""
        self._hour_tokens = hour_used
        self._hour_start = time.monotonic()

    def snapshot(self) -> dict:
        """Return current bucket state without acquiring a token."""
        self._refill()
        elapsed = time.monotonic() - self._hour_start
        return {
            "per_second": self.per_second,
            "tokens_available": round(self._tokens, 1),
            "per_hour": self.per_hour,
            "hour_used": self._hour_tokens,
            "seconds_until_reset": max(0, round(3600 - elapsed)),
        }


class BallchasingClient:
    def __init__(self, token: str, tier: str = "gold") -> None:
        self.token = token
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={"Authorization": token},
            timeout=30.0,
        )
        tier = tier.lower()
        if tier not in RATE_LIMITS:
            tier = "gold"
        self.tier = tier
        limits = RATE_LIMITS[tier]
        self._list_bucket = TokenBucket(*limits["list"])
        self._get_bucket = TokenBucket(*limits["get"])

    async def close(self) -> None:
        await self._client.aclose()

    async def ping(self) -> dict:
        await self._get_bucket.acquire()
        resp = await self._client.get("/")
        resp.raise_for_status()
        return resp.json()

    async def list_replays(self, **params) -> dict:
        await self._list_bucket.acquire()
        resp = await self._client.get("/replays", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_replay(self, replay_id: str) -> dict:
        await self._get_bucket.acquire()
        resp = await self._client.get(f"/replays/{replay_id}")
        resp.raise_for_status()
        return resp.json()

    def rate_limit_status(self) -> dict:
        return {
            "tier": self.tier,
            "list": self._list_bucket.snapshot(),
            "get": self._get_bucket.snapshot(),
        }

    async def get_maps(self) -> list:
        await self._get_bucket.acquire()
        resp = await self._client.get("/maps")
        resp.raise_for_status()
        return resp.json()
