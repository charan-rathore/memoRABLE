"""Docling-backed document parsing → markdown + semantic sections.

Hackathon defaults (digital PDFs):
  OCR = OFF
  EasyOCR = OFF
  picture classification/description = OFF
  table structure = ON (FAST mode)
  page/picture image generation = OFF
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def parse_with_docling(path: Path) -> dict[str, Any]:
    """Convert a document with Docling and return markdown + sections.

    Set DOCGRAPH_OCR=1 only for scanned pages (downloads EasyOCR models).
    Raises ImportError if Docling is not installed.
    """
    from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    from docling.document_converter import DocumentConverter, PdfFormatOption

    # pypdfium2 backend avoids native docling-parse wheel issues on macOS arm64.
    pipeline = PdfPipelineOptions()
    ocr_on = os.environ.get("DOCGRAPH_OCR", "").strip().lower() in {"1", "true", "yes"}
    pipeline.do_ocr = ocr_on
    pipeline.do_table_structure = True
    pipeline.do_picture_classification = False
    pipeline.do_picture_description = False
    pipeline.do_code_enrichment = False
    pipeline.do_formula_enrichment = False
    pipeline.generate_page_images = False
    pipeline.generate_picture_images = False
    pipeline.generate_parsed_pages = False
    try:
        pipeline.table_structure_options.mode = TableFormerMode.FAST
    except Exception:
        pass

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(
                pipeline_options=pipeline,
                backend=PyPdfiumDocumentBackend,
            ),
        }
    )
    result = converter.convert(str(path))
    document = result.document
    markdown = document.export_to_markdown()
    sections = sections_from_markdown(markdown)

    page_count = None
    try:
        page_count = len(getattr(document, "pages", []) or [])
    except Exception:
        page_count = None

    return {
        "engine": "docling",
        "markdown": markdown,
        "sections": sections,
        "pages": page_count,
        "title": _guess_title(markdown, path.name),
        "ocr": pipeline.do_ocr,
        "tables": True,
        "table_mode": "fast",
    }


def sections_from_markdown(markdown: str) -> list[dict[str, Any]]:
    """Split markdown into heading-bounded sections (Graphify-friendly)."""
    lines = markdown.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    line_no = 0

    def flush() -> None:
        nonlocal current
        if current is None:
            return
        body_lines = current["lines"]
        text = "\n".join(l["text"] for l in body_lines).strip()
        if current["heading"] or text:
            sections.append(
                {
                    "heading": current["heading"],
                    "level": current["level"],
                    "text": text,
                    "lines": body_lines,
                    "startLine": current["startLine"],
                    "endLine": body_lines[-1]["lineNo"] if body_lines else current["startLine"],
                }
            )
        current = None

    for raw in lines:
        line_no += 1
        m = HEADING_RE.match(raw)
        if m:
            flush()
            current = {
                "heading": m.group(2).strip(),
                "level": len(m.group(1)),
                "lines": [],
                "startLine": line_no,
            }
            continue
        if current is None:
            current = {
                "heading": None,
                "level": 0,
                "lines": [],
                "startLine": line_no,
            }
        current["lines"].append({"text": raw, "lineNo": line_no})

    flush()
    return sections


def _guess_title(markdown: str, fallback: str) -> str:
    for line in markdown.splitlines():
        s = line.strip()
        if not s:
            continue
        m = HEADING_RE.match(s)
        if m and len(m.group(1)) == 1:
            return m.group(2).strip()
        return s[:160]
    return Path(fallback).stem
