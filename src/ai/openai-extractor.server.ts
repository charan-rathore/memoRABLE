import "server-only";
import { LIMITS } from "@/domain/memory/limits";
import { memorySourceSchema } from "@/domain/memory/schema";
import { aiFailure, type AiResult } from "./contract";
import { AI_SYSTEM_PROMPT, buildAiUserPrompt } from "./prompt";

/**
 * Server-only OpenAI-compatible extractor.
 *
 * Isolation guarantees (reliability layer 3):
 *  - 8-second abort deadline, no automatic retries;
 *  - output validated against the exact same strict schema;
 *  - logs only request id, status class, duration and token counts —
 *    never source text, prompts, model output or secrets.
 */

export interface AiCallMeta {
  requestId: string;
  durationMs: number;
  statusClass: string;
  promptTokens?: number;
  completionTokens?: number;
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
  candidateJson: string,
  requestId: string,
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
          { role: "user", content: buildAiUserPrompt(sourceText, candidateJson) },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    meta.statusClass = `${Math.floor(response.status / 100)}xx`;

    if (response.status === 429) {
      return finish(aiFailure("rate-limited", "AI is busy right now — the local result is unchanged."));
    }
    if (!response.ok) {
      return finish(aiFailure("provider-error", "The AI provider returned an error — the local result is unchanged."));
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    meta.promptTokens = body.usage?.prompt_tokens;
    meta.completionTokens = body.usage?.completion_tokens;

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return finish(aiFailure("invalid-output", "AI returned nothing usable — the local result is unchanged."));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFences(content));
    } catch {
      return finish(aiFailure("invalid-output", "AI returned invalid JSON — the local result is unchanged."));
    }
    const improved = memorySourceSchema.safeParse(extractImproved(parsed));
    if (!improved.success) {
      return finish(aiFailure("invalid-output", "AI output did not match the memory schema — the local result is unchanged."));
    }
    return finish({ ok: true, improved: improved.data });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      meta.statusClass = "timeout";
      return finish(aiFailure("timeout", "AI took too long — the local result is unchanged."));
    }
    meta.statusClass = "error";
    return finish(aiFailure("provider-error", "AI could not be reached — the local result is unchanged."));
  } finally {
    clearTimeout(timeout);
  }
}

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fence ? fence[1]! : trimmed;
}

/** Accept either { improved: {...} } or a bare MemorySource object. */
function extractImproved(parsed: unknown): unknown {
  if (typeof parsed === "object" && parsed !== null && "improved" in parsed) {
    return (parsed as { improved: unknown }).improved;
  }
  return parsed;
}
