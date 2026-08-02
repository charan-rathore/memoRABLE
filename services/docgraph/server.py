"""
memoRABLE DocGraph sidecar — Docling parse (+ optional Graphify graph).

Hackathon posture:
  - Parsing is cached by SHA-256 of the raw file bytes.
  - Graph building is OFF by default on /parse (use /graph or ?graph=1).
  - OCR is OFF unless DOCGRAPH_OCR=1.

  uvicorn server:app --host 127.0.0.1 --port 8765
"""

from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from build_graph import build_knowledge_graph
from cache import load_cached, save_cached, sha256_bytes
from parse_docling import parse_with_docling, sections_from_markdown

app = FastAPI(title="memoRABLE DocGraph", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = int(os.environ.get("DOCGRAPH_MAX_BYTES", str(40 * 1024 * 1024)))


class MarkdownParseRequest(BaseModel):
    markdown: str = Field(min_length=1, max_length=2_000_000)
    title: str | None = None
    label: str = "pasted.md"


def _section_payload(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "heading": s.get("heading"),
            "level": s.get("level"),
            "text": s.get("text"),
            "startLine": s.get("startLine"),
            "endLine": s.get("endLine"),
            "lines": s.get("lines", []),
        }
        for s in sections
    ]


@app.get("/health")
def health() -> dict[str, Any]:
    docling_ok = False
    graphify_ok = False
    try:
        import docling  # noqa: F401

        docling_ok = True
    except Exception:
        pass
    try:
        import graphify  # noqa: F401

        graphify_ok = True
    except Exception:
        try:
            import graphifyy  # noqa: F401

            graphify_ok = True
        except Exception:
            pass
    return {
        "ok": True,
        "service": "docgraph",
        "docling": docling_ok,
        "graphify": graphify_ok,
        "ocr_default": False,
        "parse_graph_default": False,
    }


@app.post("/parse")
async def parse_upload(
    file: UploadFile = File(...),
    graph: bool = Query(
        False,
        description="If true, also build Graphify-schema KG (slow). Prefer /graph after parse.",
    ),
) -> dict[str, Any]:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_BYTES} bytes")

    digest = sha256_bytes(raw)
    cached = load_cached(digest)
    if cached:
        payload = {
            "ok": True,
            "engine": cached.get("engine", "docling"),
            "title": cached.get("title"),
            "markdown": cached["markdown"],
            "pages": cached.get("pages"),
            "sections": cached.get("sections") or sections_from_markdown(cached["markdown"]),
            "ocr": cached.get("ocr", False),
            "cache": "hit",
            "cache_key": digest,
        }
        if graph:
            t0 = time.time()
            payload["knowledgeGraph"] = build_knowledge_graph(
                title=payload["title"] or Path(file.filename or "doc").stem,
                source_file=file.filename or digest,
                sections=payload["sections"],
            )
            payload["graph_ms"] = int((time.time() - t0) * 1000)
        return payload

    suffix = Path(file.filename or "document.pdf").suffix or ".pdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = Path(tmp.name)

    try:
        t0 = time.time()
        try:
            parsed = parse_with_docling(tmp_path)
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Docling not installed: {exc}. pip install -r requirements.txt",
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=422, detail=f"Docling failed: {exc}") from exc
        parse_ms = int((time.time() - t0) * 1000)

        payload = {
            "ok": True,
            "engine": parsed["engine"],
            "title": parsed["title"],
            "markdown": parsed["markdown"],
            "pages": parsed.get("pages"),
            "sections": _section_payload(parsed["sections"]),
            "ocr": parsed.get("ocr", False),
            "tables": parsed.get("tables", True),
            "cache": "miss",
            "cache_key": digest,
            "parse_ms": parse_ms,
        }
        save_cached(
            digest,
            {
                "engine": payload["engine"],
                "title": payload["title"],
                "markdown": payload["markdown"],
                "pages": payload["pages"],
                "sections": payload["sections"],
                "ocr": payload["ocr"],
            },
        )

        if graph:
            t1 = time.time()
            payload["knowledgeGraph"] = build_knowledge_graph(
                title=payload["title"],
                source_file=file.filename or tmp_path.name,
                sections=parsed["sections"],
            )
            payload["graph_ms"] = int((time.time() - t1) * 1000)
        return payload
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/graph")
def graph_from_markdown(body: MarkdownParseRequest) -> dict[str, Any]:
    """Build Graphify-schema KG from markdown — never waits on Docling."""
    t0 = time.time()
    sections = sections_from_markdown(body.markdown)
    title = body.title or next(
        (s["heading"] for s in sections if s.get("heading")),
        Path(body.label).stem,
    )
    graph = build_knowledge_graph(title=title, source_file=body.label, sections=sections)
    return {
        "ok": True,
        "engine": "markdown",
        "title": title,
        "markdown": body.markdown,
        "sections": sections,
        "knowledgeGraph": graph,
        "graph_ms": int((time.time() - t0) * 1000),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host=os.environ.get("DOCGRAPH_HOST", "127.0.0.1"),
        port=int(os.environ.get("DOCGRAPH_PORT", "8765")),
        reload=False,
    )
