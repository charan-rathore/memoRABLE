"use client";

import { useEffect, useState } from "react";

/**
 * Live check of the Umbrex playbook pages the market-research pack cites,
 * via the bounded same-origin route /api/umbrex-guidance (fixed server-side
 * allowlist; no caller URLs). Shown only alongside the market-research
 * output. Quoted text is verbatim bounded section content anchored to
 * declared live-page heading ids; pages without anchors report a gap -
 * displayed as unverified, never presented as refreshed guidance.
 */

interface SourceStatus {
  url: string;
  outcome: "readable" | "http-error" | "unreachable";
  httpStatus?: number;
  title?: string;
  detail?: string;
  sections?: { anchorId: string; topic: string; heading: string; excerpt: string; truncatedMidSentence?: boolean }[];
  excerptNote?: string;
  fetchedAt: string;
  fromCache: boolean;
}

interface GuidanceResponse {
  checkedAt: string;
  sources: SourceStatus[];
  note: string;
}

function shortUrl(url: string): string {
  return url.replace("https://umbrex.com/resources/", "umbrex.com/.../");
}

export function LiveGuidancePanel() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: GuidanceResponse }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/umbrex-guidance", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`guidance check failed (${res.status})`);
        return (await res.json()) as GuidanceResponse;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <details className="composition-about" data-testid="live-guidance-panel">
      <summary>Live Umbrex source check</summary>
      {state.status === "loading" && <p className="crumb">Checking the cited playbook pages...</p>}
      {state.status === "error" && (
        <p className="crumb">Live check unavailable: {state.message}. The bundled guidance above still applies.</p>
      )}
      {state.status === "ready" && (
        <div>
          <p className="crumb">{state.data.note}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>
            {state.data.sources.map((s) => (
              <li key={s.url} style={{ marginBottom: 6 }}>
                <span className="tag">
                  {s.outcome === "readable" ? "readable" : s.outcome === "http-error" ? `HTTP ${s.httpStatus}` : "unreachable"}
                </span>{" "}
                <span className="crumb">
                  {s.title ? `${s.title} - ` : ""}
                  {shortUrl(s.url)} - fetched {new Date(s.fetchedAt).toLocaleString()}
                  {s.fromCache ? " (cached)" : ""}
                  {s.detail ? ` - ${s.detail}` : ""}
                </span>
                {s.sections?.map((sec) => (
                  <details key={sec.anchorId}>
                    <summary className="crumb">quoted section: {sec.topic}</summary>
                    <p className="crumb" style={{ whiteSpace: "pre-wrap" }}>
                      <a href={`${s.url}#${sec.anchorId}`} target="_blank" rel="noreferrer">{sec.heading}</a>
                      {" - "}
                      {sec.excerpt}
                    </p>
                    {sec.truncatedMidSentence ? (
                      <p className="crumb">Excerpt ends mid-sentence; the linked section has the full sentence.</p>
                    ) : null}
                  </details>
                ))}
                {s.excerptNote ? <p className="crumb">{s.excerptNote}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
