import type { Diagnostic } from "./diagnostics";

/**
 * Result<T> is the all-or-nothing contract: either a complete value plus any
 * non-fatal warnings, or a list of errors. There is no partial success state.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly Diagnostic[] }
  | { readonly ok: false; readonly errors: readonly Diagnostic[] };

export function ok<T>(value: T, warnings: readonly Diagnostic[] = []): Result<T> {
  return { ok: true, value, warnings };
}

export function err<T = never>(errors: readonly Diagnostic[]): Result<T> {
  return { ok: false, errors };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T; warnings: readonly Diagnostic[] } {
  return r.ok;
}
