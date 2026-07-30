from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from app import __version__
from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.redis_client import close_redis, redis_ping
from app.db.migrate import run_migrations
from app.db.rls import apply_rls_policies
from app.db.session import Base, check_database, engine
from app.middleware import RateLimitMiddleware, RequestIdMiddleware
from app.models import *  # noqa: F401,F403 — register models
from app.services.bootstrap import seed_if_empty

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_migrate:
        # Alembic uses asyncio.run internally — must not nest in this loop
        import asyncio

        await asyncio.to_thread(run_migrations)
    else:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    if settings.is_postgres and settings.enable_rls:
        await apply_rls_policies(engine)

    await seed_if_empty()
    yield
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    description=settings.app_full_name,
    version=__version__,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

# Order: request-id outermost so it wraps rate-limit + CORS responses
app.add_middleware(RateLimitMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.get("/live")
async def live():
    """Liveness — process is up (for orchestrators)."""
    return {"status": "alive", "service": settings.app_name, "version": __version__}


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name, "version": __version__}


@app.get("/ready")
async def ready():
    """Readiness — DB (and Redis when enabled) must be reachable before traffic."""
    db_ok = await check_database()
    if settings.redis_enabled:
        redis_ok = await redis_ping()
        redis_status = "ok" if redis_ok else "fail"
    else:
        redis_ok = True
        redis_status = "disabled"
    status = "ready" if db_ok and redis_ok else "not_ready"
    code = 200 if status == "ready" else 503
    return JSONResponse(
        status_code=code,
        content={
            "status": status,
            "checks": {
                "database": "ok" if db_ok else "fail",
                "redis": redis_status,
                "database_backend": "postgresql" if settings.is_postgres else "sqlite",
            },
            "version": __version__,
        },
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)
