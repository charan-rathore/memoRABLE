/**
 * The Sunday letter, as a share card: the one image someone posts on Monday.
 * A single cobalt field. A sentence in the serif, a count in the grotesk,
 * the dot, and a typewriter footnote. Nothing else earns a place on it.
 */
import { Canvas, Column, Heading, LineBreak, Row, Span, Text } from "@hyper-elements/react";
import { template } from "@hyper-elements/react/template";
import { headlineCount, range } from "./email";
import { letterFields } from "./fields";
import { sampleWeek } from "./sample";
import { FACES, INK } from "./theme";
import type { LetterValues } from "./week";

type Format = "landscape" | "square";

const SIZE: Record<Format, { width: number; height: number; pad: number; count: number; voice: number; note: number }> = {
  landscape: { width: 1200, height: 630, pad: 72, count: 156, voice: 52, note: 26 },
  square: { width: 1080, height: 1080, pad: 88, count: 184, voice: 60, note: 28 },
};

/** "1 replaced · 1 to re-check · week 47" — only what's true this week, in that order. */
export function cardFootnote(v: LetterValues) {
  const replaced = v.decided.filter((d) => d.replacedBy).length;
  const parts = [
    replaced ? `${replaced} replaced` : "",
    v.recheck ? "1 to re-check" : "",
    `week ${v.week}`,
  ].filter(Boolean);
  return `> ${parts.join(" · ")}`;
}

export function WeekCard({ format = "landscape", ...v }: LetterValues & { format?: Format }) {
  const s = SIZE[format];
  const count = headlineCount(v.decided.length);
  const [lead, last] = count.includes(" ") ? [count.slice(0, count.lastIndexOf(" ")), count.slice(count.lastIndexOf(" ") + 1)] : ["", count];
  return (
    <Canvas
      width={s.width}
      height={s.height}
      lang="en"
      style={{ backgroundColor: INK.cobalt, color: INK.cream, padding: s.pad, justifyContent: "space-between" }}
    >
      <Row style={{ alignItems: "start" }}>
        <Column>
          <Text style={{ fontFamily: FACES.note, fontSize: s.note, color: INK.mist }}>{`> ${v.owner.toLowerCase()} · ${range(v.weekOf, v.weekEnd)}`}</Text>
        </Column>
        <Column style={{ width: 240 }}>
          <Text style={{ fontFamily: FACES.display, fontSize: s.note, color: INK.cream, textAlign: "right" }}>memoRABLE</Text>
        </Column>
      </Row>
      <Column style={{ gap: format === "square" ? 16 : 8 }}>
        <Text style={{ fontFamily: FACES.voice, fontStyle: "italic", fontSize: s.voice, lineHeight: 1.1, color: INK.cream }}>this week i decided</Text>
        <Heading level={1} style={{ fontFamily: FACES.display, fontSize: s.count, lineHeight: 0.92, letterSpacing: -4, color: INK.cream }}>
          {format === "square" && lead ? (
            <>
              {lead}
              <LineBreak />
            </>
          ) : lead ? `${lead} ` : ""}
          {last}
          <Span style={{ color: INK.dotOnCobalt }}>.</Span>
        </Heading>
      </Column>
      <Text style={{ fontFamily: FACES.note, fontSize: s.note, color: INK.mist }}>{cardFootnote(v)}</Text>
    </Canvas>
  );
}

export default template({
  id: "memorable.WeekCard",
  version: "1.0.0",
  label: "Sunday letter — share card",
  guidance: "One image for the week. Counts are words. One dot. No logos beyond the wordmark, no photos, no gradients.",
  root: "Canvas",
  formats: {
    landscape: { width: 1200, height: 630, scale: 2 },
    square: { width: 1080, height: 1080, scale: 2 },
  },
  fields: letterFields,
  example: sampleWeek,
  render: (v, { format }) => <WeekCard {...(v as unknown as LetterValues)} format={(format as Format) ?? "landscape"} />,
});
