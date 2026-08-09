"""Local filesystem object storage with Fernet encryption-at-rest."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

from app.core.config import get_settings


def _derive_fernet(secret: str) -> Fernet:
    # Deterministic key from app secret for local/dev; replace with KMS in production
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"demsta-object-storage-v1",
        iterations=120_000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret.encode("utf-8")))
    return Fernet(key)


class LocalEncryptedStorage:
    """Stores encrypted blobs under `{root}/{clinic_id}/{prefix}/{uuid}`."""

    def __init__(self, root: Path, secret: str):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._fernet = _derive_fernet(secret)

    def put(
        self,
        *,
        clinic_id: str,
        prefix: str,
        data: bytes,
        content_type: str | None = None,
    ) -> dict:
        rel = f"{clinic_id}/{prefix}/{uuid4().hex}.bin"
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        encrypted = self._fernet.encrypt(data)
        path.write_bytes(encrypted)
        return {
            "storage_key": f"localenc://{rel}",
            "byte_size": len(data),
            "checksum_sha256": hashlib.sha256(data).hexdigest(),
            "content_type": content_type,
            "is_encrypted": True,
        }

    def get(self, storage_key: str) -> bytes:
        rel = self._rel_path(storage_key)
        path = self.root / rel
        if not path.is_file():
            raise FileNotFoundError(storage_key)
        try:
            return self._fernet.decrypt(path.read_bytes())
        except InvalidToken as exc:
            raise ValueError("Unable to decrypt object") from exc

    def exists(self, storage_key: str) -> bool:
        try:
            return (self.root / self._rel_path(storage_key)).is_file()
        except ValueError:
            return False

    def delete(self, storage_key: str) -> None:
        rel = self._rel_path(storage_key)
        path = self.root / rel
        if path.is_file():
            path.unlink()

    @staticmethod
    def _rel_path(storage_key: str) -> str:
        if storage_key.startswith("localenc://"):
            return storage_key.removeprefix("localenc://")
        if storage_key.startswith("stub://"):
            raise ValueError("Stub storage keys have no blob content")
        raise ValueError("Unsupported storage key scheme")


_storage: LocalEncryptedStorage | None = None


def get_object_storage() -> LocalEncryptedStorage:
    global _storage
    if _storage is None:
        settings = get_settings()
        root = Path(settings.object_storage_path).expanduser()
        if not root.is_absolute():
            root = Path(os.getcwd()) / root
        _storage = LocalEncryptedStorage(root, settings.secret_key)
    return _storage
