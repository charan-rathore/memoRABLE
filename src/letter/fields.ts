/**
 * The letter's fields, shared by its four templates. A field is what changes from
 * week to week; everything else (layout, type, colour, the fixed sentences) is
 * the template's, so a letter can't drift off the design.
 */
import { prop } from "@hyper-elements/react";

const handle = prop.text({ label: "Handle", required: true, maxLength: 6, pattern: "^[a-z0-9]{6}$" });
const quote = prop.text({ label: "What you wrote", required: true, maxLength: 220, guidance: "Quote the entry as written. Don't rewrite it." });
const ymd = prop.text({ label: "Date (YYYY-MM-DD)", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const letterFields = {
  owner: prop.text({ label: "Whose memory", required: true, maxLength: 40 }),
  weekOf: ymd,
  weekEnd: ymd,
  week: prop.number({ label: "ISO week", required: true, min: 1, max: 53, integer: true }),
  appUrl: prop.text({ label: "Workspace URL", required: true, pattern: "^https://" }),
  worked: prop.number({ label: "Things worked on", required: true, min: 0, integer: true }),
  tasksDone: prop.number({ label: "Tasks finished", required: true, min: 0, integer: true }),
  decided: prop.list(
    prop.object(
      {
        handle,
        text: quote,
        day: prop.choice(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const, { label: "Day", required: true }),
        replacedBy: prop.text({ label: "Replaced by (handle)", maxLength: 6 }),
        replacedText: prop.text({ label: "What replaced it", maxLength: 220 }),
      },
      { label: "Decision" },
    ),
    { label: "Decisions this week", max: 12 },
  ),
  learned: prop.list(prop.object({ handle, text: quote }, { label: "Lesson" }), { label: "Lessons this week", max: 8 }),
  days: prop.list(prop.number({ label: "Entries", min: 0, integer: true }), { label: "Entries per day, Monday first", min: 7, max: 7 }),
  recheck: prop.object(
    {
      handle,
      text: quote,
      kind: prop.choice(["decided", "learned"] as const, { label: "Kind", required: true }),
      recordedOn: ymd,
      recall: prop.number({ label: "Predicted recall %", required: true, min: 0, max: 100, integer: true }),
      reviews: prop.number({ label: "Times confirmed", required: true, min: 0, integer: true }),
      nextIfHolds: prop.number({ label: "Days to next check if it holds", required: true, min: 1, integer: true }),
    },
    { label: "Still true?", guidance: "The one entry FSRS predicts you are most likely to have forgotten the reason for." },
  ),
  alsoDue: prop.number({ label: "Also due", required: true, min: 0, integer: true }),
} as const;
