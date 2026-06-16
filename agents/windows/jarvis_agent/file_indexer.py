from __future__ import annotations

import hashlib
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .search_engine import infer_kind, score


@dataclass(frozen=True)
class IndexedFile:
    local_file_id: str
    path: Path
    file_name: str
    file_kind: str
    file_size: int
    modified_at: str


class FileIndexer:
    def __init__(self, db_path: Path, allowed_dirs: tuple[Path, ...]) -> None:
        self.db_path = db_path
        self.allowed_dirs = allowed_dirs
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS files (
              local_file_id TEXT PRIMARY KEY,
              path TEXT NOT NULL,
              file_name TEXT NOT NULL,
              file_kind TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              modified_at TEXT NOT NULL,
              last_seen_at TEXT NOT NULL
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(local_file_id UNINDEXED, file_name);
            """
        )
        self.conn.commit()

    def scan_once(self) -> int:
        count = 0
        for root in self.allowed_dirs:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if path.is_file() and not self._is_hidden(path):
                    self.upsert(path)
                    count += 1
        return count

    def upsert(self, path: Path) -> IndexedFile:
        stat = path.stat()
        modified_at = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()
        indexed = IndexedFile(
            local_file_id=self._local_file_id(path),
            path=path,
            file_name=path.name,
            file_kind=infer_kind(path.name),
            file_size=stat.st_size,
            modified_at=modified_at,
        )
        self.conn.execute(
            """
            INSERT INTO files(local_file_id, path, file_name, file_kind, file_size, modified_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(local_file_id) DO UPDATE SET
              path = excluded.path,
              file_name = excluded.file_name,
              file_kind = excluded.file_kind,
              file_size = excluded.file_size,
              modified_at = excluded.modified_at,
              last_seen_at = excluded.last_seen_at
            """,
            (
                indexed.local_file_id,
                str(path),
                indexed.file_name,
                indexed.file_kind,
                indexed.file_size,
                indexed.modified_at,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        self.conn.execute("DELETE FROM files_fts WHERE local_file_id = ?", (indexed.local_file_id,))
        self.conn.execute("INSERT INTO files_fts(local_file_id, file_name) VALUES (?, ?)", (indexed.local_file_id, indexed.file_name))
        self.conn.commit()
        return indexed

    def search(self, query: str, requested_kind: str | None = None, limit: int = 10) -> list[dict]:
        rows = self.conn.execute(
            """
            SELECT local_file_id, path, file_name, file_kind, file_size, modified_at
            FROM files
            ORDER BY last_seen_at DESC
            LIMIT 500
            """
        ).fetchall()
        ranked = []
        for row in rows:
            value = score(query, row["file_name"], row["file_kind"], requested_kind, row["modified_at"])
            if value < 0.18:
                continue
            ranked.append(
                {
                    "localFileId": row["local_file_id"],
                    "fileName": row["file_name"],
                    "fileKind": row["file_kind"],
                    "fileSize": row["file_size"],
                    "filePathHint": self._friendly_path(Path(row["path"])),
                    "modifiedAt": row["modified_at"],
                    "thumbnailToken": f"local-thumb:{row['local_file_id']}",
                    "score": value,
                }
            )
        return sorted(ranked, key=lambda item: item["score"], reverse=True)[:limit]

    def path_for(self, local_file_id: str) -> Path:
        row = self.conn.execute("SELECT path FROM files WHERE local_file_id = ?", (local_file_id,)).fetchone()
        if not row:
            raise FileNotFoundError(local_file_id)
        path = Path(row["path"]).resolve()
        if not self._is_allowed(path):
            raise PermissionError("Arquivo fora das pastas autorizadas.")
        return path

    def _local_file_id(self, path: Path) -> str:
        digest = hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()
        return digest[:32]

    def _friendly_path(self, path: Path) -> str:
        for root in self.allowed_dirs:
            try:
                return str(path.relative_to(root))
            except ValueError:
                continue
        return path.name

    def _is_allowed(self, path: Path) -> bool:
        return any(path.is_relative_to(root) for root in self.allowed_dirs)

    def _is_hidden(self, path: Path) -> bool:
        return any(part.startswith(".") for part in path.parts) or bool(os.stat(path).st_file_attributes & 2) if os.name == "nt" else any(part.startswith(".") for part in path.parts)
