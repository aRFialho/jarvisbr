from __future__ import annotations

import math
import re
import unicodedata
from datetime import datetime, timezone


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9\s._-]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def infer_kind(file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"}:
        return "image"
    if ext in {"pdf", "doc", "docx", "txt", "md", "xls", "xlsx", "ppt", "pptx"}:
        return "document"
    if ext in {"mp4", "mov", "avi", "mkv"}:
        return "video"
    if ext in {"mp3", "wav", "ogg", "flac"}:
        return "audio"
    return "other"


def score(query: str, file_name: str, file_kind: str, requested_kind: str | None, modified_at: str | None) -> float:
    q = normalize(query)
    name = normalize(file_name)
    q_tokens = set(q.split())
    name_tokens = set(re.split(r"[\s._-]+", name))
    overlap = len(q_tokens & name_tokens) / max(len(q_tokens), 1)
    contains = 1.0 if q and q in name else similarity(q, name)
    kind_boost = 1.0 if requested_kind and requested_kind == file_kind else 0.0
    recency = recency_boost(modified_at)
    return round(0.50 * contains + 0.20 * overlap + 0.15 * kind_boost + 0.10 * recency + 0.05, 2)


def similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    distance = levenshtein(a, b)
    return 1 - distance / max(len(a), len(b))


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(current[-1] + 1, prev[j] + 1, prev[j - 1] + (ca != cb)))
        prev = current
    return prev[-1]


def recency_boost(modified_at: str | None) -> float:
    if not modified_at:
        return 0.3
    try:
        modified = datetime.fromisoformat(modified_at.replace("Z", "+00:00"))
    except ValueError:
        return 0.3
    days = max((datetime.now(timezone.utc) - modified.astimezone(timezone.utc)).days, 0)
    return max(0.0, math.exp(-days / 30))
