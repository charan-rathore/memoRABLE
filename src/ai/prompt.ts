/**
 * AI prompts for memoRABLE.
 *
 * The cognitive engine (v6) is the primary extraction prompt. The legacy
 * "improve candidate" prompt remains only as a thin fallback reference.
 */

export { V6_SYSTEM_PROMPT as AI_SYSTEM_PROMPT, buildV6UserPrompt as buildAiUserPrompt } from "./v6/prompt";

/** @deprecated Use V6_SYSTEM_PROMPT via AI_SYSTEM_PROMPT. */
export const LEGACY_IMPROVE_PROMPT = `You are the memoRABLE extraction assistant.
Return an improved MemorySource JSON for the six blocks. Never invent owners, dates, metrics, severities or statuses. Output JSON only.`;
