"""Optional generic Nugen API adapter.

The supplied project brief does not specify Nugen's API URL or exact contract.
Configure these values from Nugen's official documentation before use.
"""
import os
import httpx

class NugenNotConfigured(RuntimeError):
    pass

def _config():
    key = os.getenv("NUGEN_API_KEY", "").strip()
    base_url = os.getenv("NUGEN_API_BASE_URL", "").strip().rstrip("/")
    if not key or not base_url:
        raise NugenNotConfigured(
            "Set NUGEN_API_KEY and NUGEN_API_BASE_URL using Nugen's official API documentation."
        )
    header = os.getenv("NUGEN_API_KEY_HEADER", "Authorization").strip() or "Authorization"
    prefix = os.getenv("NUGEN_API_KEY_PREFIX", "Bearer").strip()
    value = f"{prefix} {key}".strip() if prefix else key
    return base_url, {header: value}

async def get_json(path: str, params: dict | None = None) -> dict:
    """GET a documented Nugen endpoint path and return its JSON response."""
    base_url, headers = _config()
    safe_path = path.lstrip("/")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{base_url}/{safe_path}", headers=headers, params=params)
        response.raise_for_status()
        return response.json()
