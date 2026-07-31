import { diagnostic, type Diagnostic } from "@/reliability/diagnostics";
import { LIMITS, UNSAFE_KEYS } from "@/domain/memory/limits";
import { err, ok, type Result } from "@/reliability/result";

/**
 * Input containment (reliability layer 1): cheap, exact checks that run
 * before any parser. Binary/NUL content, oversize input, excessive nesting
 * and prototype-pollution keys are rejected with precise locations.
 */

export interface PreflightedInput {
  /** BOM-stripped, line-ending-normalized source text. */
  text: string;
  /** True when the first non-whitespace character begins JSON. */
  looksLikeJson: boolean;
  byteLength: number;
}

export function preflightInput(raw: string): Result<PreflightedInput> {
  if (raw.length === 0 || raw.trim().length === 0) {
    return err([diagnostic("input.empty", "There is nothing here yet. Paste JSON, Markdown or plain text first.")]);
  }

  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > LIMITS.maxInputBytes) {
    return err([
      diagnostic(
        "input.too-large",
        `This is ${formatBytes(byteLength)}. The limit is ${formatBytes(LIMITS.maxInputBytes)}. Try a smaller file.`,
      ),
    ]);
  }

  // Binary detection: NUL bytes or a high ratio of control characters.
  const nulIndex = raw.indexOf("\u0000");
  if (nulIndex !== -1) {
    const { line, column } = lineColumnOf(raw, nulIndex);
    return err([
      diagnostic(
        "input.binary",
        "This looks like a binary file, not text. Bring a .json, .md or .txt file.",
        { line, column },
      ),
    ]);
  }
  const sample = raw.slice(0, 4096);
  const controlCount = (sample.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  if (sample.length > 0 && controlCount / sample.length > 0.05) {
    return err([
      diagnostic("input.binary", "This looks like a binary file, not text. Bring a .json, .md or .txt file."),
    ]);
  }

  // Strip BOM and normalize line endings once, up front.
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstMeaningful = text.trimStart().charAt(0);
  return ok({
    text,
    looksLikeJson: firstMeaningful === "{" || firstMeaningful === "[",
    byteLength,
  });
}

/** Depth + unsafe-key + collection-size walk over already-parsed JSON. */
export function checkJsonSafety(value: unknown): Diagnostic[] {
  const problems: Diagnostic[] = [];
  const visit = (node: unknown, depth: number, path: string): void => {
    if (depth > LIMITS.maxJsonDepth) {
      problems.push(
        diagnostic("input.too-deep", `This JSON nests deeper than ${LIMITS.maxJsonDepth} levels.`, { path }),
      );
      return;
    }
    if (Array.isArray(node)) {
      if (node.length > LIMITS.maxEntriesPerBlock) {
        problems.push(
          diagnostic(
            "input.too-many-entries",
            `This list has ${node.length} entries. The limit is ${LIMITS.maxEntriesPerBlock}.`,
            { path },
          ),
        );
      }
      node.forEach((item, i) => visit(item, depth + 1, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        if (UNSAFE_KEYS.has(key)) {
          problems.push(
            diagnostic("input.unsafe-key", `The key "${key}" is not allowed.`, { path: joinPath(path, key) }),
          );
          continue;
        }
        visit((node as Record<string, unknown>)[key], depth + 1, joinPath(path, key));
      }
    }
  };
  visit(value, 0, "$");
  return problems;
}

export function joinPath(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

/** Convert a character offset into 1-based line/column. */
export function lineColumnOf(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastBreak = -1;
  const bounded = Math.min(offset, text.length);
  for (let i = 0; i < bounded; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lastBreak = i;
    }
  }
  return { line, column: bounded - lastBreak };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
