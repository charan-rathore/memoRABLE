"use client";

import { useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import { downloadTextFile } from "@/utils/download";

/**
 * "Write this week's letter": the Sunday letter from this device's log, as an
 * HTML email and its plain text. Hyper Elements loads only when asked.
 */
export function LetterExport({ engine }: { engine: DailyEngine }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [note, setNote] = useState("");

  const write = async () => {
    setState("busy");
    try {
      const [{ render }, { LetterEmail }, { weekLetter }] = await Promise.all([
        import("@hyper-elements/react"),
        import("@/letter/email"),
        import("@/letter/week"),
      ]);
      const values = weekLetter(engine.workspace, new Date(), { appUrl: window.location.origin });
      const { html, text } = await render(<LetterEmail {...values} />);
      downloadTextFile({ filename: `sunday-letter-week-${values.week}.html`, content: html, mimeType: "text/html" });
      if (text) downloadTextFile({ filename: `sunday-letter-week-${values.week}.txt`, content: text, mimeType: "text/plain" });
      setNote(`Week ${values.week}: ${values.decided.length} ${values.decided.length === 1 ? "decision" : "decisions"}${values.recheck ? ", one to re-check" : ""}.`);
      setState("done");
    } catch (e) {
      setNote(e instanceof Error ? e.message.split("\n")[0]! : "The letter could not be written.");
      setState("error");
    }
  };

  return (
    <div className="td-letter-export">
      <button type="button" className="td-ghost" onClick={write} disabled={state === "busy"}>
        {state === "busy" ? "Writing…" : "Write this week's letter"}
      </button>
      {note && <p className="td-sub-note" role={state === "error" ? "alert" : "status"}>{note}</p>}
    </div>
  );
}
