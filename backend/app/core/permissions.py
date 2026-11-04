"""Role definitions and the single permission table for API authorisation.

Sign-up lets a person choose their own role, but every role is a fixed, self-service role: there is
no admin role in this table, so a self-chosen role can never grant administrative rights.
"""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    researcher = "researcher"
    academic = "academic"
    tourism = "tourism"
    archivist = "archivist"


ROLE_LABELS: dict[str, str] = {
    UserRole.researcher: "Cultural researcher",
    UserRole.academic: "Academic institution",
    UserRole.tourism: "Heritage tourism",
    UserRole.archivist: "Digital archivist",
}

# Keep every permission in one place: routes depend on permissions, never on role names.
PERMISSIONS: dict[str, frozenset[str]] = {
    UserRole.researcher: frozenset({"archive", "search", "reader"}),
    UserRole.academic: frozenset({"archive", "search", "reader"}),
    UserRole.tourism: frozenset({"sites", "journeys", "culture"}),
    UserRole.archivist: frozenset(
        {"contribute", "reprocess", "pipeline", "review", "archive", "search", "reader"}
    ),
}


def permissions_for(role: str) -> frozenset[str]:
    return PERMISSIONS.get(role, frozenset())
