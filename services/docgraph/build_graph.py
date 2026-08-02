"""
Build a Graphify-schema knowledge graph from Docling sections.

Confidence labels match Graphify:
  EXTRACTED — explicitly present in the source
  INFERRED  — reasonable deduction across sections
  AMBIGUOUS — uncertain; surfaced for review

When the graphifyy package is installed, we also run its build/cluster/analyze
pipeline over the same extraction dict so god-nodes and communities enrich
the response. LLM-backed doc extractors inside Graphify are optional and only
run when an API key / backend is configured.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

ROLE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("abstract", re.compile(r"\babstract\b", re.I)),
    ("introduction", re.compile(r"\b(introduction|background|related\s+work)\b", re.I)),
    ("hypothesis", re.compile(r"\b(hypothesis|research\s+questions?|problem\s+statement)\b", re.I)),
    ("method", re.compile(r"\b(method(?:ology)?|methods|experimental\s+setup|experiments?)\b", re.I)),
    ("results", re.compile(r"\b(results?|findings?|evaluation)\b", re.I)),
    ("discussion", re.compile(r"\bdiscussion\b", re.I)),
    ("conclusion", re.compile(r"\bconclusions?\b", re.I)),
    ("limitations", re.compile(r"\blimitations?\b", re.I)),
    ("future", re.compile(r"\b(future\s+work|further\s+work|future\s+(?:research|directions?))\b", re.I)),
    ("references", re.compile(r"\breferences?\b", re.I)),
]

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z“\"'(\[])")
METRIC_RE = re.compile(
    r"\b(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:points?|pts?|ms|s|×|x|f1|accuracy|recall|precision)|"
    r"(?:f1|accuracy|recall|precision)\s*(?:of|=|:)?\s*\d)",
    re.I,
)
CITATION_RE = re.compile(r"\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]|\((?:[A-Z][a-z]+(?:\s+et\s+al\.)?,?\s*)+\d{4}[a-z]?\)")
LIMIT_RE = re.compile(
    r"\b(limited\s+to|only\s+(?:evaluated|tested|studied)|untested|single\s+dataset|"
    r"we\s+(?:did|do)\s+not|cost\s+constraints?)\b",
    re.I,
)
FUTURE_RE = re.compile(
    r"\b(future\s+work|further\s+work|should\s+(?:evaluate|explore|investigate)|"
    r"we\s+(?:plan|aim|hope)\s+to|next\s+steps?)\b",
    re.I,
)
GAP_RE = re.compile(
    r"\b(little\s+(?:is\s+)?known|gap|however|despite|remains?\s+(?:unclear|open)|"
    r"not\s+(?:well\s+)?understood|under[\s-]?explored)\b",
    re.I,
)


def _nid(kind: str, label: str) -> str:
    digest = hashlib.sha256(f"{kind}:{label.lower()}".encode("utf-8")).hexdigest()[:12]
    return f"{kind}_{digest}"


def _role_for(heading: str | None) -> str:
    if not heading:
        return "other"
    for role, pattern in ROLE_PATTERNS:
        if pattern.search(heading):
            return role
    return "other"


def _sentences(text: str) -> list[str]:
    out: list[str] = []
    for chunk in text.split("\n"):
        chunk = chunk.strip()
        if not chunk or chunk.startswith("```"):
            continue
        chunk = re.sub(r"^[-*+]\s+", "", chunk)
        chunk = re.sub(r"^\d+\.\s+", "", chunk)
        for s in SENTENCE_SPLIT.split(chunk):
            s = re.sub(r"\s+", " ", s).strip()
            if len(s.split()) >= 4:
                out.append(s)
    return out


def extract_paper_graph(
    *,
    title: str,
    source_file: str,
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    """Deterministic Graphify-schema extraction from structured sections."""
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    paper_id = _nid("paper", title)
    nodes.append(
        {
            "id": paper_id,
            "label": title,
            "kind": "paper",
            "source_file": source_file,
            "source_location": "title",
        }
    )

    section_ids: dict[str, str] = {}
    claim_pool: list[tuple[str, str, str]] = []  # (node_id, role, sentence)

    for section in sections:
        heading = section.get("heading")
        role = _role_for(heading)
        if role == "references":
            continue
        text = section.get("text") or ""
        if not heading and not text.strip():
            continue

        label = heading or role
        sid = _nid("section", f"{role}:{label}")
        section_ids[role] = sid
        start = section.get("startLine")
        loc = f"L{start}" if start else role
        nodes.append(
            {
                "id": sid,
                "label": label,
                "kind": "section",
                "role": role,
                "source_file": source_file,
                "source_location": loc,
            }
        )
        edges.append(
            {
                "source": paper_id,
                "target": sid,
                "relation": "contains",
                "confidence": "EXTRACTED",
            }
        )

        for sentence in _sentences(text)[:24]:
            kind = "claim"
            relation = "states"
            confidence = "EXTRACTED"
            if METRIC_RE.search(sentence):
                kind = "metric"
                relation = "reports"
            elif role == "limitations" or LIMIT_RE.search(sentence):
                kind = "limitation"
                relation = "bounds"
            elif role == "future" or FUTURE_RE.search(sentence):
                kind = "future_work"
                relation = "proposes"
            elif role in ("abstract", "introduction", "hypothesis") and GAP_RE.search(sentence):
                kind = "research_gap"
                relation = "motivates"

            cid = _nid(kind, sentence[:160])
            nodes.append(
                {
                    "id": cid,
                    "label": sentence[:160],
                    "kind": kind,
                    "source_file": source_file,
                    "source_location": loc,
                }
            )
            edges.append(
                {
                    "source": sid,
                    "target": cid,
                    "relation": relation,
                    "confidence": confidence,
                }
            )
            claim_pool.append((cid, role, sentence))

            for cite in CITATION_RE.findall(sentence)[:3]:
                cite_label = cite if isinstance(cite, str) else str(cite)
                if not cite_label:
                    continue
                rid = _nid("citation", cite_label)
                nodes.append(
                    {
                        "id": rid,
                        "label": f"cite:{cite_label}"[:120],
                        "kind": "citation",
                        "source_file": source_file,
                        "source_location": loc,
                    }
                )
                edges.append(
                    {
                        "source": cid,
                        "target": rid,
                        "relation": "cites",
                        "confidence": "EXTRACTED",
                    }
                )

    # Cross-section INFERRED edges (Graphify second pass).
    metrics = [c for c in claim_pool if c[0].startswith("metric_")]
    qualitative = [
        c for c in claim_pool if c[1] in ("results", "conclusion") and not c[0].startswith("metric_")
    ]
    result_claims = [c for c in claim_pool if c[1] in ("results", "conclusion")]
    findings = qualitative if qualitative else result_claims
    limitations = [c for c in claim_pool if c[1] == "limitations" or c[0].startswith("limitation_")]
    gaps = [c for c in claim_pool if c[0].startswith("research_gap_")]

    for gap_id, _, _ in gaps[:3]:
        for find_id, _, _ in findings[:4]:
            edges.append(
                {
                    "source": gap_id,
                    "target": find_id,
                    "relation": "addressed_by",
                    "confidence": "INFERRED",
                }
            )

    for metric_id, _, _ in metrics[:6]:
        linked = False
        for find_id, _, _ in findings[:4]:
            if metric_id == find_id:
                continue
            linked = True
            edges.append(
                {
                    "source": metric_id,
                    "target": find_id,
                    "relation": "supports",
                    "confidence": "INFERRED",
                }
            )
        if not linked:
            for gap_id, _, _ in gaps[:2]:
                edges.append(
                    {
                        "source": gap_id,
                        "target": metric_id,
                        "relation": "addressed_by",
                        "confidence": "INFERRED",
                    }
                )

    for lim_id, _, _ in limitations[:4]:
        for find_id, _, _ in findings[:3]:
            edges.append(
                {
                    "source": lim_id,
                    "target": find_id,
                    "relation": "qualifies",
                    "confidence": "INFERRED",
                }
            )

    # Deduplicate nodes/edges by id / endpoint triple.
    node_map = {n["id"]: n for n in nodes}
    edge_keys: set[tuple[str, str, str]] = set()
    uniq_edges: list[dict[str, Any]] = []
    for e in edges:
        key = (e["source"], e["target"], e["relation"])
        if key in edge_keys:
            continue
        if e["source"] not in node_map or e["target"] not in node_map:
            continue
        edge_keys.add(key)
        uniq_edges.append(e)

    return {
        "nodes": list(node_map.values()),
        "edges": uniq_edges,
        "schema": "graphify-v1",
        "extractor": "docgraph-deterministic",
    }


def enrich_with_graphify(extraction: dict[str, Any]) -> dict[str, Any]:
    """Optionally run Graphify build → cluster → analyze on the extraction."""
    analysis: dict[str, Any] = {}
    try:
        from graphify.build import build_graph  # type: ignore
        from graphify.cluster import cluster  # type: ignore
        from graphify.analyze import analyze  # type: ignore

        G = build_graph([extraction])
        G = cluster(G)
        analysis = analyze(G) or {}
        # Mirror community attrs back onto nodes when present.
        community = {}
        for nid, data in G.nodes(data=True):
            if "community" in data:
                community[str(nid)] = data["community"]
        if community:
            for node in extraction["nodes"]:
                if node["id"] in community:
                    node["community"] = community[node["id"]]
        extraction = {
            **extraction,
            "extractor": "docgraph+graphify",
            "analysis": {
                "god_nodes": analysis.get("god_nodes") or analysis.get("godNodes") or [],
                "surprising_connections": analysis.get("surprising_connections")
                or analysis.get("surprises")
                or [],
                "suggested_questions": analysis.get("suggested_questions")
                or analysis.get("questions")
                or [],
            },
        }
        return extraction
    except Exception as exc:  # noqa: BLE001 — optional enrichment must never fail parse
        extraction = {
            **extraction,
            "graphify_status": f"skipped: {type(exc).__name__}: {exc}",
        }
        return _local_analysis(extraction)


def _local_analysis(extraction: dict[str, Any]) -> dict[str, Any]:
    """Degree-based god nodes when Graphify clustering isn't available."""
    degree: dict[str, int] = {}
    labels = {n["id"]: n.get("label", n["id"]) for n in extraction["nodes"]}
    for e in extraction["edges"]:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    god = sorted(degree.items(), key=lambda kv: kv[1], reverse=True)[:8]
    extraction["analysis"] = {
        "god_nodes": [{"id": i, "label": labels.get(i, i), "degree": d} for i, d in god],
        "surprising_connections": [
            {
                "source": e["source"],
                "target": e["target"],
                "relation": e["relation"],
                "confidence": e["confidence"],
            }
            for e in extraction["edges"]
            if e.get("confidence") == "INFERRED"
        ][:12],
        "suggested_questions": [
            "Which metrics most strongly support the key findings?",
            "What limitations qualify the strongest claims?",
            "Which research gap do the results actually close?",
        ],
    }
    return extraction


def build_knowledge_graph(
    *,
    title: str,
    source_file: str,
    sections: list[dict[str, Any]],
) -> dict[str, Any]:
    extraction = extract_paper_graph(title=title, source_file=source_file, sections=sections)
    return enrich_with_graphify(extraction)
