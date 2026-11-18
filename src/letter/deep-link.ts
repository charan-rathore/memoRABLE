/**
 * What the Sunday letter's links ask the app to do.
 *
 * Mail clients and corporate link scanners open every link in an email, so a
 * link never changes anything by itself: the app reads the request, asks the
 * person to confirm, and only then calls the engine. Parsing is pure so it can
 * be tested without a browser.
 */
export type LetterRequest =
  | { kind: "answer"; handle: string; answer: "holds" | "changed" }
  | { kind: "unsubscribe" }
  | { kind: "none" };

const HANDLE = /^[a-z0-9]{6}$/;

export function readLetterRequest(search: string): LetterRequest {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (q.get("letter") === "off") return { kind: "unsubscribe" };
  const handle = (q.get("still") ?? "").toLowerCase();
  const answer = q.get("answer");
  if (HANDLE.test(handle) && (answer === "holds" || answer === "changed")) return { kind: "answer", handle, answer };
  return { kind: "none" };
}

/** The same URL with the letter's parameters taken out, so a reload can't ask twice. */
export function withoutLetterParams(href: string): string {
  const u = new URL(href);
  for (const k of ["still", "answer", "letter"]) u.searchParams.delete(k);
  return u.pathname + (u.searchParams.size ? `?${u.searchParams}` : "") + u.hash;
}

export const LETTER_PREF_KEY = "memorable.letter";
