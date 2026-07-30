/**
 * Hard local input bounds. Everything is enforced in preflight before any
 * parsing or schema validation happens, so hostile input is rejected early.
 */
export const LIMITS = {
  /** Maximum raw source size: 1 MiB. */
  maxInputBytes: 1_048_576,
  /** Maximum JSON nesting depth. */
  maxJsonDepth: 12,
  /** Maximum number of blocks in a document. */
  maxBlocks: 100,
  /** Maximum entries in any single block collection. */
  maxEntriesPerBlock: 100,
  /** Maximum notes lines preserved per block. */
  maxNotesPerBlock: 100,
  /** Maximum length of any single imported string field. */
  maxFieldLength: 2_000,
  /** Maximum document title length. */
  maxTitleLength: 200,
  /** Maximum block title length. */
  maxBlockTitleLength: 120,
  /** Maximum provenance excerpt length (escaped, in characters). */
  maxExcerptLength: 240,
  /** Maximum source label length. */
  maxSourceLabelLength: 120,
  /** AI request bound: 50 KiB of source text. */
  aiMaxInputBytes: 51_200,
  /** AI abort deadline in milliseconds. */
  aiTimeoutMs: 8_000,
} as const;

/** Keys that must never be accepted from parsed JSON (prototype pollution). */
export const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
