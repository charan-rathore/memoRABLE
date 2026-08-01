import { NextResponse } from "next/server";
import { aiExtractRequestSchema } from "@/ai/contract";
import { extractWithAi, isAiEnabled } from "@/ai/openai-extractor.server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional AI cognitive extraction boundary. DISABLED by default (ENABLE_AI=false):
 * the route reports { enabled: false } and refuses work. All deterministic
 * behavior in the app works without this route ever being called.
 *
 * When enabled, the model runs the v6 Observation pipeline; Layer 3 repairs
 * failure modes; output is projected into MemorySource. Any hard failure
 * leaves the local candidate unchanged.
 */

export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}

export async function POST(request: Request) {
  if (!isAiEnabled()) {
    return NextResponse.json(
      { ok: false, reason: "disabled", message: "AI improvement is off. Everything you see is deterministic and local." },
      { status: 404 },
    );
  }

  const requestId = randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid-output", message: "Send a JSON body." }, { status: 400 });
  }
  const parsed = aiExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "invalid-output", message: "The request did not match the AI contract." },
      { status: 400 },
    );
  }

  const { result, meta } = await extractWithAi(
    parsed.data.sourceText,
    parsed.data.candidate,
    requestId,
  );
  console.info(
    `[ai] id=${meta.requestId} status=${meta.statusClass} ms=${meta.durationMs}` +
      (meta.promptTokens !== undefined ? ` prompt_tokens=${meta.promptTokens}` : "") +
      (meta.completionTokens !== undefined ? ` completion_tokens=${meta.completionTokens}` : "") +
      (meta.repairModes?.length ? ` repairs=${meta.repairModes.join(",")}` : "") +
      (meta.usedCandidateFallback ? " fallback=candidate" : ""),
  );

  if (!result.ok) {
    const status = result.reason === "rate-limited" ? 429 : result.reason === "timeout" ? 504 : 502;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({ ok: true, improved: result.improved });
}
