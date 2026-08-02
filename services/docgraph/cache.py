"""SHA-256 content cache for Docling markdown (never re-parse the same PDF)."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any


def cache_dir() -> Path:
    raw = os.environ.get("DOCGRAPH_CACHE_DIR", "").strip()
    root = Path(raw) if raw else Path(__file__).resolve().parent / ".cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_path(digest: str) -> Path:
    return cache_dir() / f"{digest}.json"


def load_cached(digest: str) -> dict[str, Any] | None:
    path = cache_path(digest)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "markdown" not in data:
            return None
        data["cache"] = "hit"
        data["cache_key"] = digest
        return data
    except Exception:
        return None


def save_cached(digest: str, payload: dict[str, Any]) -> None:
    path = cache_path(digest)
    out = {
        **payload,
        "cache_key": digest,
        "cached_at": time.time(),
    }
    # Don't store giant line arrays twice — sections without per-line payloads are enough.
    sections = []
    for s in out.get("sections") or []:
        sections.append(
            {
                "heading": s.get("heading"),
                "level": s.get("level"),
                "text": s.get("text"),
                "startLine": s.get("startLine"),
                "endLine": s.get("endLine"),
            }
        )
    out["sections"] = sections
    path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
