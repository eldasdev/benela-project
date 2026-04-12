from __future__ import annotations

from supabase import create_client, Client
from core.config import settings

_admin_client: Client | None = None


def get_supabase_admin() -> Client:
    """Returns a Supabase client initialized with the service_role key."""
    global _admin_client
    if _admin_client is None:
        if not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured.")
        _admin_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _admin_client
