/**
 * The decision record: the week's decisions as a printed document, one to a
 * page, for the folder, the design review, or the person who asks in March why
 * the team moved off Redis. Renders to print HTML, and to PDF with
 * `@hyper-elements/react/pdf`.
 */
import { Column, Document, Heading, PageFooter, PageNumber, Row, Section, Span, Text } from "@hyper-elements/react";
import { template } from "@hyper-elements/react/template";
import { headlineCount, range, shortDate } from "./email";
import { letterFields } from "./fields";
import { sampleWeek } from "./sample";
import { INK, letterTheme } from "./theme";
import type { LetterValues } from "./week";

const DAY_NAME: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const note = (color: string) => ({ apply: ["note" as const], color });

export function DecisionRecord(v: LetterValues) {
  const replaced = v.decided.filter((d) => d.replacedBy).length;
  return (
    <Document theme={letterTheme} size="A4" margin={0} lang="en" title={`Decision record · week ${v.week}`}>
      <PageFooter style={{ padding: [0, 48, 28, 48] }}>
        <Row stackOnMobile={false}>
          <Column><Text style={note(INK.stone)}>memoRABLE · decision record · week {v.week}</Text></Column>
          <Column><Text style={{ ...note(INK.stone), textAlign: "right" }}><PageNumber /> / <PageNumber total /></Text></Column>
        </Row>
      </PageFooter>

      <Document.Page style={{ backgroundColor: INK.cream }}>
      <Section style={{ backgroundColor: INK.cobalt, padding: [64, 48, 72, 48], gap: 40 }}>
        <Text style={note(INK.mist)}>{v.owner} · {range(v.weekOf, v.weekEnd)}</Text>
        <Column style={{ gap: 6 }}>
          <Text style={{ apply: ["voice"], color: INK.cream, fontSize: 40, lineHeight: 1 }}>the record of</Text>
          <Heading level={1} style={{ color: INK.cream, fontSize: 104, letterSpacing: -4, lineHeight: 0.9 }}>
            {headlineCount(v.decided.length)}<Span style={{ color: INK.dotOnCobalt }}>.</Span>
          </Heading>
        </Column>
        <Text style={note(INK.mist)}>
          &gt; each decision on its own page, as it was written.{replaced ? ` ${replaced === 1 ? "one was" : `${replaced} were`} replaced before the week ended; the page says by what.` : ""}
        </Text>
      </Section>
      <Section style={{ backgroundColor: INK.cream, padding: [40, 48], gap: 14 }}>
        {v.decided.map((d, i) => (
          <Row key={d.handle} stackOnMobile={false} style={{ gap: 16, padding: [0, 0, 14, 0], border: { bottom: { width: 1, style: "solid", color: INK.rule } } }}>
            <Column style={{ width: 40 }}><Text style={note(INK.stone)}>{String(i + 2).padStart(2, "0")}</Text></Column>
            <Column><Text style={{ fontSize: 15, color: d.replacedBy ? INK.stone : INK.ink }}>{d.replacedBy ? <Span style={{ textDecoration: "line-through" }}>{d.text}</Span> : d.text}</Text></Column>
            <Column style={{ width: 80 }}><Text style={{ ...note(INK.stone), textAlign: "right" }}>#{d.handle}</Text></Column>
          </Row>
        ))}
      </Section>
      </Document.Page>

      {v.decided.map((d) => (
        <Document.Page key={d.handle} style={{ backgroundColor: d.replacedBy ? INK.pink : INK.cream }}>
          <Section style={{ padding: [64, 48], gap: 28 }}>
            <Row stackOnMobile={false}>
              <Column><Text style={note(d.replacedBy ? INK.plum : INK.stone)}>#{d.handle}</Text></Column>
              <Column><Text style={{ ...note(d.replacedBy ? INK.plum : INK.stone), textAlign: "right" }}>{DAY_NAME[d.day]} of week {v.week}</Text></Column>
            </Row>
            <Text style={{ apply: ["voice"], fontSize: 34, lineHeight: 1 }}>{d.replacedBy ? "decided, then replaced" : "decided"}</Text>
            <Heading level={2} style={{ fontSize: 46, lineHeight: 1.02, letterSpacing: -1.6 }}>
              {d.replacedBy ? <Span style={{ textDecoration: "line-through" }}>{d.text}</Span> : d.text}
            </Heading>
            {d.replacedBy ? (
              <Column style={{ gap: 10, padding: [24, 0, 0, 0], border: { top: { width: 2, style: "solid", color: INK.ink } } }}>
                <Text style={note(INK.plum)}>&gt; replaced by #{d.replacedBy}</Text>
                <Text style={{ fontFamily: "'Archivo Black', 'Arial Black', Arial, sans-serif", fontSize: 26, lineHeight: 1.15 }}>{d.replacedText}</Text>
                <Text style={{ fontSize: 15, color: INK.plum }}>
                  The old decision stays in the log, struck through and linked, so the reason it changed is still findable. Recall shows the replacement first.
                </Text>
              </Column>
            ) : (
              <Column style={{ gap: 10, padding: [24, 0, 0, 0], border: { top: { width: 2, style: "solid", color: INK.ink } } }}>
                <Text style={note(INK.stone)}>&gt; in force at the end of the week.</Text>
                <Text style={{ fontSize: 15, color: INK.stone }}>
                  It comes back for a &ldquo;still true?&rdquo; check when memoRABLE predicts you are likely to have forgotten why it holds.
                </Text>
              </Column>
            )}
          </Section>
        </Document.Page>
      ))}

      {v.recheck && (
        <Document.Page style={{ backgroundColor: INK.pink }}>
          <Section style={{ padding: [64, 48], gap: 24 }}>
            <Text style={{ apply: ["voice"], fontSize: 40, lineHeight: 1 }}>and one older decision to look at again</Text>
            <Heading level={2} style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: -1.2 }}>{v.recheck.text}</Heading>
            <Text style={note(INK.plum)}>
              &gt; #{v.recheck.handle}, {v.recheck.kind} {shortDate(v.recheck.recordedOn)}. {v.recheck.recall}% likely you still remember why.
            </Text>
          </Section>
        </Document.Page>
      )}
    </Document>
  );
}

export default template({
  id: "memorable.DecisionRecord",
  version: "1.0.0",
  label: "Decision record (PDF)",
  guidance: "One decision per page. Never paraphrase a decision; a replaced one keeps its text, struck through.",
  root: "Document",
  fields: letterFields,
  rules: { require: { core: ["layout/overflow"] }, root: { lang: true } },
  // The example is typed as the values the components take; the template checks it against its fields.
  example: sampleWeek as never,
  render: (v) => <DecisionRecord {...(v as unknown as LetterValues)} />,
});
