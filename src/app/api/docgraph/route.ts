import "server-only";

import { NextResponse } from "next/server";

/**
 * Proxy to the Python DocGraph sidecar.
 * Parse is cached server-side by SHA-256; graph building is opt-in (?graph=1).
 */

const DEFAULT_URL = "http://127.0.0.1:8765";

function sidecarUrl(): string {
  return (process.env.DOCGRAPH_URL ?? DEFAULT_URL).replace(/\/$/, "");
}

export async function GET() {
  const base = sidecarUrl();
  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, available: false, reason: `sidecar HTTP ${res.status}` },
        { status: 503 },
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ...body, available: true, url: base });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        reason: err instanceof Error ? err.message : "sidecar unreachable",
        hint: "Start services/docgraph (uvicorn server:app --port 8765)",
      },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const base = sidecarUrl();
  const url = new URL(req.url);
  const graph = url.searchParams.get("graph") === "1";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file field" }, { status: 400 });
  }

  try {
    const upstream = new FormData();
    upstream.append("file", file, file.name);
    const res = await fetch(`${base}/parse?graph=${graph ? "1" : "0"}`, {
      method: "POST",
      body: upstream,
      // Background refine may be slow on cold models; UI already showed pdf.js memories.
      signal: AbortSignal.timeout(300_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { ok: false, error: text.slice(0, 400) };
    }
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: err instanceof Error ? err.message : "sidecar unreachable",
      },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  const base = sidecarUrl();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const res = await fetch(`${base}/graph`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: err instanceof Error ? err.message : "sidecar unreachable",
      },
      { status: 503 },
    );
  }
}
