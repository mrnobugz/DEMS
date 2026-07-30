"""HTTP middleware: request IDs + Redis-backed rate limiting."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.redis_client import rate_limit_allow
from app.core.tenant import clear_tenant


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        finally:
            clear_tenant()
        response.headers["X-Request-ID"] = request_id
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        if request.url.path in {"/health", "/ready", "/live"}:
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        path = request.url.path
        is_auth = path.startswith(f"{settings.api_v1_prefix}/auth")
        limit = settings.rate_limit_auth_requests if is_auth else settings.rate_limit_requests
        window = (
            settings.rate_limit_auth_window_seconds if is_auth else settings.rate_limit_window_seconds
        )
        key = f"rl:{'auth' if is_auth else 'api'}:{client}"

        allowed, remaining = await rate_limit_allow(key, limit=limit, window_seconds=window)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests. Slow down and retry.",
                        "details": [{"retry_after_seconds": window}],
                    }
                },
                headers={
                    "Retry-After": str(window),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
