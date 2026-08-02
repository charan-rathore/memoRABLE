# DocGraph sidecar (experimental)

Docling parse + optional Graphify-schema graphs for **research-like PDFs**.

## Hackathon posture

| Path | Role |
|---|---|
| **pdf.js** | Default upload — always |
| **Docling** | Opt-in background refine for research / heavy PDFs only |
| **Graphify schema** | Built in TypeScript on import; sidecar `/graph` is optional |

Do **not** make Docling the default parser.

## Setup

```bash
cd services/docgraph
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8765
```

Or from repo root: `npm run docgraph`

Enable in the Next.js app:

```bash
NEXT_PUBLIC_DOCGRAPH=1 npm run dev
```

## Defaults

- **OCR / EasyOCR:** OFF (`DOCGRAPH_OCR=1` to enable)
- **Tables:** ON (TableFormer FAST)
- **Picture description / classification:** OFF
- **Parse cache:** SHA-256 of raw bytes → `services/docgraph/.cache/`
- **`POST /parse?graph=0`:** markdown only (default) — Graphify does not block parse
- **`POST /graph`:** build KG from markdown separately

## Client flow

```
Upload PDF
  → pdf.js (1–3s) → memories immediately
  → if flag + selective heuristic (research / >20pp / table-heavy)
      → background Docling (cached)
      → re-import only if quality improves
```

Resume / Invoice / typical PRDs never wait on Docling.
