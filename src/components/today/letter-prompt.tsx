"use client";

import { useEffect, useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import type { Entry } from "@/daily/types";
import { LETTER_PREF_KEY, readLetterRequest, withoutLetterParams, type LetterRequest } from "@/letter/deep-link";

type Run = <T>(fn: (e: DailyEngine) => Promise<T> | T) => Promise<T | undefined>;

const setPref = (v: "on" | "off") => {
  try { window.localStorage.setItem(LETTER_PREF_KEY, v); } catch { /* private mode: the banner still says what happened */ }
};

/**
 * Arrived from the Sunday letter. The link only carried the question; the
 * answer is recorded when the person presses the button here, never on load.
 */
export function LetterPrompt({ engine, run, onAnnounce, onHandle }: {
  engine: DailyEngine;
  run: Run;
  onAnnounce: (m: string) => void;
  onHandle: (h: string) => void;
}) {
  const [req, setReq] = useState<LetterRequest>({ kind: "none" });
  const [entry, setEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r = readLetterRequest(window.location.search);
    if (r.kind === "none") return;
    window.history.replaceState(null, "", withoutLetterParams(window.location.href));
    if (r.kind === "unsubscribe") setPref("off");
    if (r.kind === "answer") {
      const e = engine.findByHandle(r.handle);
      if (!e) { onAnnounce(`#${r.handle} from your letter was deleted or isn't on this device`); return; }
      setEntry(e);
    }
    setReq(r);
  }, [engine, onAnnounce]);

  if (req.kind === "none") return null;

  if (req.kind === "unsubscribe") {
    return (
      <div className="td-letter-prompt" role="status">
        <p>The Sunday letter is off. Nothing else changed.</p>
        <button type="button" className="td-ghost" onClick={() => { setPref("on"); setReq({ kind: "none" }); onAnnounce("The Sunday letter is back on."); }}>Turn it back on</button>
      </div>
    );
  }

  if (!entry) return null;
  const holds = req.answer === "holds";
  const confirm = async () => {
    setBusy(true);
    const after = await run((en) => en.reconfirm(entry.id, req.answer));
    setBusy(false);
    if (!after) return;
    onAnnounce(holds ? `Confirmed #${entry.handle} from your letter.` : `Reopened #${entry.handle}. It is in Next until you replace it.`);
    setReq({ kind: "none" });
    onHandle(entry.handle);
  };

  return (
    <div className="td-letter-prompt" role="group" aria-labelledby="letter-prompt-h">
      <p id="letter-prompt-h">
        From your Sunday letter: <button type="button" className="td-handle" onClick={() => onHandle(entry.handle)}>#{entry.handle}</button>{" "}
        <q>{entry.text}</q>
      </p>
      <div className="td-letter-actions">
        <button type="button" className="td-save sm" disabled={busy} onClick={confirm}>
          {holds ? "Yes, it still holds" : "It changed, reopen it"}
        </button>
        <button type="button" className="td-ghost" disabled={busy} onClick={() => setReq({ kind: "none" })}>Not now</button>
      </div>
    </div>
  );
}
