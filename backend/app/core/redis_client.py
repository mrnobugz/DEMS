"""Async Redis client with in-process fallback for local/dev without Redis."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from typing import Deque

from app.core.config import get_settings

_redis = None
_redis_failed = False
_memory_buckets: dict[str, Deque[float]] = defaultdict(deque)
_memory_lock = asyncio.Lock()


async def get_redis():
    """Return a connected redis.asyncio client, or None if unavailable."""
    global _redis, _redis_failed
    settings = get_settings()
    if not settings.redis_enabled or _redis_failed:
        return None
    if _redis is not None:
        return _redis
    try:
        from redis.asyncio import Redis

        client = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        await client.ping()
        _redis = client
        return _redis
    except Exception:
        _redis_failed = True
        return None


async def close_redis() -> None:
    global _redis, _redis_failed
    if _redis is not None:
        await _redis.aclose()
        _redis = None
    _redis_failed = False


async def cache_get(key: str) -> str | None:
    client = await get_redis()
    if client is None:
        return None
    return await client.get(key)


async def cache_set(key: str, value: str, ttl_seconds: int = 60) -> None:
    client = await get_redis()
    if client is None:
        return
    await client.set(key, value, ex=ttl_seconds)


async def rate_limit_allow(key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
    """
    Sliding-window rate limit.
    Returns (allowed, remaining). Uses Redis when available, else in-memory.
    """
    client = await get_redis()
    now = time.time()
    if client is not None:
        # Redis sorted-set sliding window
        pipe = client.pipeline()
        window_start = now - window_seconds
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zadd(key, {f"{now}": now})
        pipe.zcard(key)
        pipe.expire(key, window_seconds + 1)
        results = await pipe.execute()
        count = int(results[2])
        remaining = max(0, limit - count)
        return count <= limit, remaining

    async with _memory_lock:
        bucket = _memory_buckets[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False, 0
        bucket.append(now)
        return True, max(0, limit - len(bucket))


async def redis_ping() -> bool:
    client = await get_redis()
    if client is None:
        return False
    try:
        return bool(await client.ping())
    except Exception:
        return False
