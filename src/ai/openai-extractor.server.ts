import "server-only";
import { LIMITS } from "@/domain/memory/limits";
import { memorySourceSchema, type MemorySource } from "@/domain/memory/schema";
import { aiFailure, type AiResult } from "./contract";
import { AI_SYSTEM_PROMPT, buildAiUserPrompt } from "./prompt";
import { runCognitivePipeline } from "./v6";

/**
 * Server-only OpenAI-compatible cognitive extractor (Layer 2).
 *
 * Isolation guarantees:
 *  - abort deadline (LIMITS.aiTimeoutMs), no automatic retries;
 *  - model output parsed as v6 Observations, repaired by Layer 3, projected
 *    into MemorySource, then validated against the same strict schema;
 *  - on any failure mode, the local candidate is left unchanged;
 *  - logs only request id, status class, duration, token counts, repair modes
 *    — never source text, prompts, model output or secrets.
 */

export interface AiCallMeta {
  requestId: string;
  durationMs: number;
  statusClass: string;
  promptTokens?: number;
  completionTokens?: number;
  repairModes?: string[];
  usedCandidateFallback?: boolean;
}

export interface AiCallOutcome {
  result: AiResult;
  meta: AiCallMeta;
}

export function isAiEnabled(): boolean {
  return process.env.ENABLE_AI === "true" && Boolean(process.env.OPENAI_API_KEY);
}

export async function extractWithAi(
  sourceText: string,
  candidate: MemorySource,
  requestId: string,
  filename?: string,
): Promise<AiCallOutcome> {
  const started = Date.now();
  const meta: AiCallMeta = { requestId, durationMs: 0, statusClass: "none" };
  const finish = (result: AiResult): AiCallOutcome => {
    meta.durationMs = Date.now() - started;
    return { result, meta };
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    meta.statusClass = "config";
    return finish(aiFailure("missing-config", "AI is not configured on this server."));
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const candidateJson = JSON.stringify(candidate);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITS.aiTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildAiUserPrompt({
              sourceText,
              filename,
              candidateHint: candidateJson,
            }),
          },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    meta.statusClass = `${Math.floor(response.status / 100)}xx`;

    if (response.status === 429) {
      return finish(aiFailure("rate-limited", "AI is busy right now. The local result is unchanged."));
    }
    if (!response.ok) {
      return finish(aiFailure("provider-error", "The AI provider returned an error. The local result is unchanged."));
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    meta.promptTokens = body.usage?.prompt_tokens;
    meta.completionTokens = body.usage?.completion_tokens;

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return finish(aiFailure("invalid-output", "AI returned nothing usable. The local result is unchanged."));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(content));
    } catch {
      return finish(aiFailure("invalid-output", "AI returned invalid JSON. The local result is unchanged."));
    }

    // Accept bare v6 JSON, { improved: MemorySource }, or a bare MemorySource.
    const pipeline = runCognitivePipeline(unwrapModelPayload(parsed), {
      titleHint: candidate.title,
      candidate,
    });
    meta.repairModes = pipeline.repairs.map((r) => r.mode);

    if (!pipeline.ok) {
      // Last chance: maybe the model returned a MemorySource directly.
      const legacy = memorySourceSchema.safeParse(extractImproved(parsed));
      if (legacy.success) {
        return finish({ ok: true, improved: legacy.data });
      }
      return finish(aiFailure(pipeline.reason === "projection_failed" ? "invalid-output" : "invalid-output", pipeline.message));
    }

    meta.usedCandidateFallback = pipeline.usedCandidateFallback;
    return finish({ ok: true, improved: pipeline.improved });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      meta.statusClass = "timeout";
      return finish(aiFailure("timeout", "AI took too long. The local result is unchanged."));
    }
    meta.statusClass = "error";
    return finish(aiFailure("provider-error", "AI could not be reached. The local result is unchanged."));
  } finally {
    clearTimeout(timeout);
  }
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fence ? fence[1]! : trimmed;
}

/** Prefer v6 shape; unwrap wrappers that some models emit. */
function unwrapModelPayload(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed;
  const obj = parsed as Record<string, unknown>;
  if (obj.document_meta) return parsed;
  if (obj.extraction && typeof obj.extraction === "object") return obj.extraction;
  if (obj.result && typeof obj.result === "object") return obj.result;
  if (obj.improved && typeof obj.improved === "object") {
    const improved = obj.improved as Record<string, unknown>;
    if (improved.document_meta) return improved;
  }
  return parsed;
}

/** Accept either { improved: {..} } or a bare MemorySource object. */
function extractImproved(parsed: unknown): unknown {
  if (typeof parsed === "object" && parsed !== null && "improved" in parsed) {
    return (parsed as { improved: unknown }).improved;
  }
  return parsed;
}
