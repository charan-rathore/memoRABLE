import { sha256Hex } from "@/utils/sha256";
import type { MemoryBlock, MemoryDocument } from "./schema";

/**
 * Stable canonical serialization.
 *
 * - object keys are sorted lexicographically (arrays keep their order);
 * - strings are NFC-normalized with CRLF/CR collapsed to LF;
 * - diagnostics, warnings, timestamps and rendered output are excluded.
 *
 * The same logical document therefore always produces the same bytes, on any
 * platform, which is what makes IDs and content hashes stable across repeats.
 */

function normalizeString(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function toCanonical(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return normalizeString(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toCanonical);
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = toCanonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return null;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(toCanonical(value));
}

/** The canonical projection of a block: everything that defines its identity. */
export function canonicalBlockProjection(block: MemoryBlock): unknown {
  return {
    kind: block.kind,
    title: block.title,
    sourceOrder: block.sourceOrder,
    provenance: {
      method: block.provenance.method,
      label: block.provenance.label,
      locator: block.provenance.locator,
      excerpt: block.provenance.excerpt,
    },
    payload: block.payload,
  };
}

/** The canonical projection of a document (warnings/hashes/ids excluded). */
export function canonicalDocumentProjection(doc: MemoryDocument): unknown {
  return {
    schemaVersion: 1,
    title: doc.title,
    sourceMethod: doc.sourceMethod,
    sourceLabel: doc.sourceLabel,
    blocks: doc.blocks.map(canonicalBlockProjection),
    // Relations are addressed by kind and entry index, so they survive
    // reordering untouched and belong to the document's identity.
    relations: doc.relations,
  };
}

export function canonicalizeDocument(doc: MemoryDocument): string {
  return stableStringify(canonicalDocumentProjection(doc));
}

export function contentHashOf(doc: MemoryDocument): string {
  return sha256Hex(stableStringify(canonicalDocumentProjection(doc)));
}

/**
 * Stable block id: derived from kind + title + payload + provenance locator,
 * so identical content imports the identical id every time, and reordering
 * never changes ids. `sourceOrder` is excluded so arrangement is free.
 */
export function stableBlockId(input: {
  kind: string;
  title: string;
  payload: unknown;
  locator: string;
}): string {
  return sha256Hex(stableStringify(input));
}

/** Short, human-discussable hash prefix used in ids. */
export function shortHash(fullHex: string, length = 12): string {
  return fullHex.slice(0, length);
}
