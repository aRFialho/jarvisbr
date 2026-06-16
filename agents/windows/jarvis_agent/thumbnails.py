from __future__ import annotations

from pathlib import Path


def thumbnail_token_for(path: Path) -> str:
    return f"local-thumb:{path.name}"
