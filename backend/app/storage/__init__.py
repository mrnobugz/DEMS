"""Object storage adapters for clinical media (imaging, consents)."""

from app.storage.local_encrypted import LocalEncryptedStorage, get_object_storage

__all__ = ["LocalEncryptedStorage", "get_object_storage"]
