/**
 * Diagnostics are the single error/warning contract used across preflight,
 * import, normalization, rendering and export. They always carry an
 * actionable message plus an optional machine-readable location.
 */

export type DiagnosticCode =
  | "input.empty"
  | "input.too-large"
  | "input.binary"
  | "input.too-deep"
  | "input.unsafe-key"
  | "input.too-many-blocks"
  | "input.too-many-entries"
  | "json.syntax"
  | "json.unsupported-version"
  | "json.unknown-key"
  | "json.unknown-kind"
  | "json.duplicate-kind"
  | "json.missing-kind"
  | "json.invalid-field"
  | "json.legacy-status"
  | "text.unrecognized-section"
  | "text.no-blocks-recognized"
  | "text.understood"
  | "render.block-failed"
  | "render.mode-failed"
  | "render.json-incompatible"
  | "ai.disabled"
  | "ai.failed"
  | "ai.invalid-output";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  /** Human, actionable message. Never includes secrets or full source content. */
  readonly message: string;
  /** JSON-path style location, e.g. "blocks[2].payload.entries[0].severity". */
  readonly path?: string;
  /** 1-based source line when known. */
  readonly line?: number;
  /** 1-based source column when known. */
  readonly column?: number;
}

export function diagnostic(
  code: DiagnosticCode,
  message: string,
  location?: { path?: string; line?: number; column?: number },
): Diagnostic {
  return { code, message, ...location };
}

/** Format a diagnostic for friendly, exact error surfaces. */
export function formatDiagnostic(d: Diagnostic): string {
  const where =
    d.line !== undefined
      ? `line ${d.line}${d.column !== undefined ? `, column ${d.column}` : ""}`
      : d.path;
  return where ? `${d.message} (${where})` : d.message;
}
