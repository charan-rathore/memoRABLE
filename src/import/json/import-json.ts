import type { z } from "zod";
import { diagnostic, type Diagnostic } from "@/reliability/diagnostics";
import { err, ok, type Result } from "@/reliability/result";
import { checkJsonSafety, lineColumnOf } from "../preflight";
import { LIMITS } from "@/domain/memory/limits";
import { normalizeSource } from "@/domain/memory/normalize";
import {
  BLOCK_KINDS,
  isBlockKind,
  memorySourceSchema,
  type BlockKind,
  type MemoryDocument,
} from "@/domain/memory/schema";
import { sha256Hex } from "@/utils/sha256";

/**
 * Deterministic JSON import. strict and all-or-nothing.
 *
 * Any syntax, safety, schema or semantic problem rejects the ENTIRE import
 * with actionable, path-addressed diagnostics. Nothing is partially applied,
 * and this path never invokes the text parser or AI.
 */

export interface JsonImportInput {
  /** Preflighted text (BOM stripped, LF line endings). */
  text: string;
  /** Sanitized human label, e.g. "atlas-q3-brief.json". */
  label: string;
}

export function importJson(input: JsonImportInput): Result<MemoryDocument> {
  const { text, label } = input;

  // 1. Syntax.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return err([syntaxDiagnostic(text, error)]);
  }

  // 2. Safety: depth, collection sizes, prototype-pollution keys.
  const safety = checkJsonSafety(parsed);
  if (safety.length > 0) return err(safety);

  // 3. Shape: unsupported version gets a dedicated, friendly error.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err([
      diagnostic(
        "json.invalid-field",
        'Expected a JSON object like { "version": 1, "title": "…", "blocks": [ … ] }.',
        { path: "$" },
      ),
    ]);
  }
  const root = parsed as Record<string, unknown>;
  if ("version" in root && root.version !== 1) {
    return err([
      diagnostic(
        "json.unsupported-version",
        `This file uses version ${JSON.stringify(root.version)}. memoRABLE understands version 1.`,
        { path: "$.version" },
      ),
    ]);
  }

  // 4. Compatibility: rewrite fields whose vocabulary has since changed.
  const migrated = migrateLegacyFields(root);

  // 5. Strict schema validation.
  const parsedSource = memorySourceSchema.safeParse(parsed);
  if (!parsedSource.success) {
    return err(parsedSource.error.issues.map(issueToDiagnostic));
  }

  // 6. Semantics: exactly one of each of the six kinds.
  const semantic = checkBlockSemantics(parsedSource.data.blocks.map((b) => b.kind));
  if (semantic.length > 0) return err(semantic);

  // 7. Normalize into the canonical document with stable ids/provenance.
  const excerptFor = excerptForKind(text);
  const document = normalizeSource(parsedSource.data, { label, excerptFor });
  return ok(document, migrated);
}

/**
 * Documents saved before an action had a readiness keep loading.
 *
 * `open` used to be the only word for unfinished work. It is now `pending`,
 * which says the same thing in a word a person would use, and the rewrite is
 * announced rather than done quietly.
 */
function migrateLegacyFields(root: Record<string, unknown>): Diagnostic[] {
  const blocks = root.blocks;
  if (!Array.isArray(blocks)) return [];
  let rewritten = 0;
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;
    const payload = (block as Record<string, unknown>).payload;
    if (typeof payload !== "object" || payload === null) continue;
    const entries = (payload as Record<string, unknown>).entries;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (record.status === "open") {
        record.status = "pending";
        rewritten++;
      }
    }
  }
  if (rewritten === 0) return [];
  return [
    diagnostic(
      "json.legacy-status",
      `${rewritten} ${rewritten === 1 ? "action was" : "actions were"} marked "open"; they now read "Pending".`,
    ),
  ];
}

function checkBlockSemantics(kinds: readonly BlockKind[]): Diagnostic[] {
  const problems: Diagnostic[] = [];
  const seen = new Map<BlockKind, number>();
  kinds.forEach((kind, index) => {
    const firstIndex = seen.get(kind);
    if (firstIndex !== undefined) {
      problems.push(
        diagnostic(
          "json.duplicate-kind",
          `There are two "${kind}" blocks (blocks[${firstIndex}] and blocks[${index}]). Keep exactly one of each of the six.`,
          { path: `$.blocks[${index}].kind` },
        ),
      );
    } else {
      seen.set(kind, index);
    }
  });
  for (const required of BLOCK_KINDS) {
    if (!seen.has(required)) {
      problems.push(
        diagnostic(
          "json.missing-kind",
          `A "${required}" block is missing. All six memories. ${BLOCK_KINDS.join(", ")}. are required.`,
          { path: "$.blocks" },
        ),
      );
    }
  }
  return problems;
}

function issueToDiagnostic(issue: z.ZodIssue): Diagnostic {
  const path = "$" + (issue.path.length ? "." + issue.path.map(formatPathSegment).join(".") : "");
  const cleaned = path.replace(/\.\[/g, "[");
  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((k) => `"${k}"`).join(", ");
    // Distinguish an unknown block kind from other unknown keys.
    if (cleaned.endsWith(".kind") || issue.keys.some((k) => !isBlockKind(k) && k === "kind")) {
      return diagnostic("json.unknown-kind", `Unknown block kind ${keys}.`, { path: cleaned });
    }
    return diagnostic(
      "json.unknown-key",
      `Unknown ${issue.keys.length === 1 ? "key" : "keys"} ${keys}. remove ${issue.keys.length === 1 ? "it" : "them"} or check the spelling.`,
      { path: cleaned },
    );
  }
  if (issue.code === "invalid_enum_value" && cleaned.endsWith(".kind")) {
    return diagnostic(
      "json.unknown-kind",
      `"${String(issue.received)}" is not a memory kind. Use one of: ${BLOCK_KINDS.join(", ")}.`,
      { path: cleaned },
    );
  }
  if (issue.code === "invalid_union_discriminator") {
    return diagnostic(
      "json.unknown-kind",
      `Unknown memory kind. Use one of: ${BLOCK_KINDS.join(", ")}.`,
      { path: cleaned },
    );
  }
  if (issue.code === "invalid_literal" && cleaned === "$.version") {
    return diagnostic(
      "json.unsupported-version",
      `This file uses version ${JSON.stringify(issue.received)}. memoRABLE understands version 1.`,
      { path: cleaned },
    );
  }
  if (issue.code === "too_big" && issue.type === "array") {
    return diagnostic(
      "input.too-many-entries",
      `This list has more than ${issue.maximum} entries. split the content or shorten it.`,
      { path: cleaned },
    );
  }
  return diagnostic("json.invalid-field", friendlyIssueMessage(issue), { path: cleaned });
}

function friendlyIssueMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `Expected ${issue.expected} but found ${issue.received}.`;
    case "too_small":
      return issue.type === "string"
        ? "This field must not be empty."
        : `This needs at least ${issue.minimum} ${issue.type === "array" ? "entries" : "characters"}.`;
    case "too_big":
      return `This is longer than the ${issue.maximum}-character limit.`;
    case "invalid_enum_value":
      return `"${String(issue.received)}" is not one of the allowed values: ${issue.options.map((o) => `"${String(o)}"`).join(", ")}.`;
    case "invalid_union":
      return "This does not match any of the six memory payload shapes.";
    default:
      return issue.message;
  }
}

function formatPathSegment(segment: string | number): string {
  return typeof segment === "number" ? `[${segment}]` : segment;
}

/** Best-effort line/column extraction for JSON.parse failures. */
export function syntaxDiagnostic(text: string, error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  // Modern engines: ".. at position 123" or ".. (line 4 column 12)".
  const lineCol = /\(line (\d+) column (\d+)\)/.exec(message);
  if (lineCol) {
    return diagnostic("json.syntax", "We couldn't understand this JSON. Check the syntax here.", {
      line: Number(lineCol[1]),
      column: Number(lineCol[2]),
    });
  }
  const pos = /position (\d+)/.exec(message);
  if (pos) {
    const { line, column } = lineColumnOf(text, Number(pos[1]));
    return diagnostic("json.syntax", "We couldn't understand this JSON. Check the syntax here.", {
      line,
      column,
    });
  }
  return diagnostic("json.syntax", `We couldn't understand this JSON: ${message}.`);
}

/**
 * Produce a short, stable excerpt of the source region for a block kind . 
 * capped at 240 characters and derived deterministically from the raw text.
 */
function excerptForKind(text: string): (kind: BlockKind, index: number) => string {
  const lines = text.split("\n");
  const needleCache = new Map<BlockKind, number>();
  return (kind, index) => {
    let lineIndex = needleCache.get(kind);
    if (lineIndex === undefined) {
      const needle = `"${kind}"`;
      lineIndex = lines.findIndex((l) => l.includes(needle));
      needleCache.set(kind, lineIndex);
    }
    const start = lineIndex >= 0 ? lineIndex : Math.min(index, lines.length - 1);
    const slice = lines.slice(Math.max(0, start), Math.max(0, start) + 3).join("\n").trim();
    return capExcerpt(slice);
  };
}

export function capExcerpt(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > LIMITS.maxExcerptLength
    ? single.slice(0, LIMITS.maxExcerptLength - 1) + "…"
    : single;
}

/** Deterministic fingerprint used by the curated verified-example lookup. */
export function sourceFingerprint(text: string): string {
  return sha256Hex(text.normalize("NFC").replace(/\r\n?/g, "\n").trim());
}
