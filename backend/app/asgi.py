"""One server: the clinic API, plus Django admin at /admin."""

from __future__ import annotations

import logging
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "admin_site.settings")

from app.main import app as fastapi_app

logger = logging.getLogger("demsta.admin")

_django = None
_prepared = False


def _is_django(path: str) -> bool:
    return path == "/admin" or path.startswith("/admin/") or path.startswith("/static/")


def _boot_django():
    import django
    from django.core.asgi import get_asgi_application
    from django.core.management import call_command

    django.setup()
    call_command("migrate", "--database", "default", interactive=False, verbosity=0)
    return get_asgi_application()


async def _prepare_django() -> None:
    global _django, _prepared
    if _prepared:
        return
    _prepared = True
    import asyncio

    try:
        _django = await asyncio.to_thread(_boot_django)
    except Exception:
        logger.exception("Django admin did not start")
        _django = None


async def _admin_down(send) -> None:
    body = (
        b'{"error":{"code":"ADMIN_UNAVAILABLE","message":"Clinic admin is not available","details":[]}}'
    )
    await send(
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


async def application(scope, receive, send):
    if scope["type"] == "lifespan":
        await _prepare_django()
        await fastapi_app(scope, receive, send)
        return
    path = scope.get("path") or ""
    if scope["type"] == "http" and _is_django(path):
        await _prepare_django()
        if _django is None:
            await _admin_down(send)
            return
        await _django(scope, receive, send)
        return
    await fastapi_app(scope, receive, send)
