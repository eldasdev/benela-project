from __future__ import annotations

ALL_ERP_MODULES = frozenset({
    "dashboard",
    "projects",
    "finance",
    "hr",
    "sales",
    "support",
    "legal",
    "marketing",
    "supply_chain",
    "procurement",
    "insights",
})

ALWAYS_ALLOWED_MODULES = frozenset({"dashboard"})


def validate_modules(modules: list[str]) -> list[str]:
    normalized = [m.strip().lower() for m in modules if m.strip()]
    invalid = set(normalized) - ALL_ERP_MODULES
    if invalid:
        raise ValueError(f"Invalid modules: {', '.join(sorted(invalid))}")
    result = set(normalized) | ALWAYS_ALLOWED_MODULES
    return sorted(result)


def modules_to_csv(modules: list[str]) -> str:
    return ",".join(validate_modules(modules))


def csv_to_modules(csv_str: str) -> list[str]:
    return [m.strip() for m in (csv_str or "dashboard").split(",") if m.strip()]
