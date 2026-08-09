"""Render / production settings normalizers."""

import unittest

from app.core.config import Settings


class RenderConfigTests(unittest.TestCase):
    def test_postgres_url_from_render(self) -> None:
        s = Settings(
            database_url="postgres://demsta:secret@dpg-abc.oregon-postgres.render.com/demsta",
            secret_key="x",
        )
        self.assertTrue(s.database_url.startswith("postgresql+asyncpg://"))
        self.assertIn("ssl=require", s.database_url)
        self.assertTrue(s.is_postgres)

    def test_docker_compose_url_skips_ssl(self) -> None:
        s = Settings(
            database_url="postgresql+asyncpg://demsta:demsta@db:5432/demsta",
            secret_key="x",
        )
        self.assertNotIn("ssl=", s.database_url)

    def test_cors_comma_separated(self) -> None:
        s = Settings(
            cors_origins="https://a.onrender.com, https://b.onrender.com",
            secret_key="x",
        )
        self.assertEqual(
            s.cors_origins,
            ["https://a.onrender.com", "https://b.onrender.com"],
        )

    def test_frontend_origin_appended(self) -> None:
        s = Settings(
            cors_origins=["http://localhost:5173"],
            frontend_origin="https://demsta-web.onrender.com/",
            secret_key="x",
        )
        self.assertIn("https://demsta-web.onrender.com", s.cors_origins)

    def test_production_disables_debug(self) -> None:
        s = Settings(environment="production", debug=True, secret_key="x")
        self.assertFalse(s.debug)


if __name__ == "__main__":
    unittest.main()
