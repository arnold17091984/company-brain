"""Fernet symmetric encryption for sensitive values (API keys)."""

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _get_fernet() -> Fernet | None:
    """Return a Fernet instance if ENCRYPTION_KEY is configured."""
    key = settings.encryption_key
    if not key:
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns base64-encoded ciphertext."""
    f = _get_fernet()
    if f is None:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a base64-encoded ciphertext string."""
    f = _get_fernet()
    if f is None:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt value") from exc
