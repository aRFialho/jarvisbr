from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class Turn:
    role: str
    content: str


class MemoryStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def add(self, role: str, content: str) -> None:
        if not content.strip():
            return
        with self._connect() as conn:
            conn.execute("INSERT INTO turns(role, content) VALUES (?, ?)", (role, content.strip()))

    def recent(self, limit: int = 12) -> list[Turn]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT role, content FROM turns ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [Turn(role=row[0], content=row[1]) for row in reversed(rows)]
