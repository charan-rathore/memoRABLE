import { z } from "zod";
import { memorySourceSchema } from "@/domain/memory/schema";
import { LIMITS } from "@/domain/memory/limits";

/**
 * AI contract (reliability layer 3). The AI route is DISABLED by default and
 * only ever proposes an improved MemorySource — the client validates the
 * response against the exact same strict schema before it can replace the
 * local candidate. Any failure leaves the local result unchanged.
 */

export const aiExtractRequestSchema = z
  .object({
    /** Source text, bounded to 50 KiB. */
    sourceText: z.string().min(1).max(LIMITS.aiMaxInputBytes),
    /** The deterministic local candidate the AI may improve upon. */
    candidate: memorySourceSchema,
  })
  .strict();

export const aiExtractResponseSchema = z
  .object({
    improved: memorySourceSchema,
  })
  .strict();

export type AiExtractRequest = z.infer<typeof aiExtractRequestSchema>;
export type AiExtractResponse = z.infer<typeof aiExtractResponseSchema>;

export type AiFailureReason =
  | "disabled"
  | "missing-config"
  | "timeout"
  | "rate-limited"
  | "provider-error"
  | "invalid-output";

export interface AiFailure {
  ok: false;
  reason: AiFailureReason;
  /** Redacted, safe-to-display message. Never contains source text or prompts. */
  message: string;
}

export interface AiSuccess {
  ok: true;
  improved: z.infer<typeof memorySourceSchema>;
}

export type AiResult = AiSuccess | AiFailure;

export function aiFailure(reason: AiFailureReason, message: string): AiFailure {
  return { ok: false, reason, message };
}
