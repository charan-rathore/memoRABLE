/**
 * The Sunday letter, as an email. Four bands, read top to bottom:
 *   cobalt  what the week added up to
 *   pink    the one thing to re-check, with two answers
 *   cream   the week in order: decisions (replaced ones struck through), lessons
 *   ink     sign-off and the way out
 */
import { Button, Column, Email, Heading, LineBreak, Link, Row, Section, Span, Text, token } from "@hyper-elements/react";
import { template } from "@hyper-elements/react/template";
import { lint } from "@hyper-elements/lint";
import { letterFields } from "./fields";
import { sampleWeek } from "./sample";
import { FACES, INK, fontFaces, letterTheme } from "./theme";
import { answerLink, type LetterValues } from "./week";

const W = 600;
const PAD = 40;
const DAYS = ["m", "t", "w", "t", "f", "s", "s"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
};
export const range = (a: string, b: string) => {
  const [ma, mb] = [a.slice(5, 7), b.slice(5, 7)];
  return ma === mb ? `${Number(a.slice(8))}–${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const confirmedLine = (n: number) => (n === 0 ? "never re-checked" : n === 1 ? "confirmed once" : `confirmed ${n} times`);
const WORDS = ["nothing", "one thing", "two things", "three things", "four things", "five things", "six things", "seven things", "eight things", "nine things", "ten things", "eleven things", "twelve things"];
/** Counts read as words, the way you'd say them; digits only past twelve. */
export const headlineCount = (n: number) => WORDS[n] ?? `${n} things`;

const note = (color: string) => ({ apply: ["note" as const], color });

export function WeekBars({ days, on, off, label }: { days: number[]; on: string; off: string; label: string }) {
  const max = Math.max(1, ...days);
  return (
    <Row stackOnMobile={false} style={{ gap: 6, alignItems: "end" }}>
      {days.map((n, i) => (
        <Column key={i} style={{ gap: 6, alignItems: "center" }}>
          <Row stackOnMobile={false} style={{ width: 22, height: 6 + Math.round((n / max) * 54), backgroundColor: n ? on : off }} />
          <Text style={{ apply: ["note"], color: label, textAlign: "center" }}>{DAYS[i]}</Text>
        </Column>
      ))}
    </Row>
  );
}

export function LetterEmail(v: LetterValues) {
  const replaced = v.decided.filter((d) => d.replacedBy).length;
  const r = v.recheck;
  return (
    <Email theme={letterTheme} width={W} lang="en" fonts={[...fontFaces]} title={`Week ${v.week}, remembered`}
      previewText={`${headlineCount(v.decided.length)} decided${replaced ? `, ${replaced} replaced` : ""}${r ? `, and one to re-check: ${r.text}` : ""}.`}>
      <Section style={{ backgroundColor: token("colors.cobalt"), padding: [36, PAD, 44, PAD], gap: 28, mobile: { padding: [28, 24, 36, 24] } }}>
        <Row stackOnMobile={false}>
          <Column><Text style={note(INK.mist)}>memoRABLE · week {v.week}</Text></Column>
          <Column><Text style={{ ...note(INK.mist), textAlign: "right" }}>{range(v.weekOf, v.weekEnd)}</Text></Column>
        </Row>
        <Column style={{ gap: 4 }}>
          <Text style={{ apply: ["voice"], color: INK.cream, fontSize: 34, lineHeight: 1.1, mobile: { fontSize: 28 } }}>this week you decided</Text>
          <Heading level={1} style={{ color: INK.cream, fontSize: 84, letterSpacing: -3, lineHeight: 0.95, mobile: { fontSize: 52, letterSpacing: -1.5 } }}>
            {headlineCount(v.decided.length)}<Span style={{ color: INK.dotOnCobalt }}>.</Span>
          </Heading>
        </Column>
        <Text style={note(INK.mist)}>
          &gt; written from your own log, on your device. no model read it.
          {replaced > 0 && (<><LineBreak />&gt; {plural(replaced, "of them", "of them")} didn&apos;t last the week.</>)}
        </Text>
      </Section>

      {r && (
        <Section style={{ backgroundColor: token("colors.pink"), padding: [40, PAD], gap: 20, mobile: { padding: [32, 24] } }}>
          <Text style={{ apply: ["voice"], color: INK.ink, fontSize: 40, lineHeight: 1, mobile: { fontSize: 32 } }}>still true?</Text>
          <Heading level={2} style={{ color: INK.ink }}>{r.text}</Heading>
          <Column style={{ gap: 8 }}>
            <Row stackOnMobile={false} style={{ height: 8 }}>
              <Column style={{ width: `${r.recall}%`, height: 8, backgroundColor: INK.ink, mobile: { width: `${r.recall}%` } }} />
              <Column style={{ height: 8, backgroundColor: INK.plum }} />
            </Row>
            <Text style={note(INK.plum)}>
              &gt; {r.recall}% likely you still remember why. below 90%, it comes back. {r.kind === "decided" ? "decided" : "learned"} {shortDate(r.recordedOn)}, {confirmedLine(r.reviews)}.
            </Text>
          </Column>
          <Row style={{ gap: 12 }}>
            <Column style={{ width: 132, mobile: { width: "100%" } }}>
              <Button href={answerLink(v.appUrl, r.handle, "holds")} aria-label={`It still holds: ${r.text}`}>Still holds</Button>
            </Column>
            <Column style={{ width: 144, mobile: { width: "100%" } }}>
            <Button href={answerLink(v.appUrl, r.handle, "changed")} aria-label={`It changed: ${r.text}`}
              style={{ backgroundColor: INK.pink, color: INK.ink, border: { width: 2, style: "solid", color: INK.ink }, padding: [12, 20], hover: { backgroundColor: INK.cream } }}>
              {r.kind === "decided" ? "It changed" : "I forgot"}
            </Button>
            </Column>
            <Column hidden={{ mobile: true }} />
          </Row>
          <Text style={note(INK.plum)}>
            &gt; &ldquo;still holds&rdquo; moves the next check about {plural(r.nextIfHolds, "day")} out. the app asks before it records anything.
            {v.alsoDue > 0 && (<><LineBreak />&gt; {plural(v.alsoDue, "more is", "more are")} waiting in your workspace.</>)}
          </Text>
        </Section>
      )}

      <Section style={{ backgroundColor: token("colors.cream"), padding: [44, PAD], gap: 28, mobile: { padding: [36, 24] } }}>
        <Row style={{ gap: 24, alignItems: "end" }}>
          <Column style={{ gap: 6 }}>
            <Text style={{ apply: ["voice"], fontSize: 30, lineHeight: 1.05 }}>the week, in order</Text>
            <Text style={note(INK.stone)}>&gt; one bar per day, by how much you wrote.</Text>
          </Column>
          <Column style={{ width: 230, mobile: { width: "100%" } }}>
            <WeekBars days={v.days} on={INK.cobalt} off={INK.rule} label={INK.stone} />
          </Column>
        </Row>

        {v.decided.length > 0 && (
          <Column style={{ gap: 14, padding: [20, 0, 0, 0], border: { top: { width: 2, style: "solid", color: INK.ink } } }}>
            {v.decided.map((d) => (
              <Row key={d.handle} stackOnMobile={false} style={{ gap: 14, alignItems: "start" }}>
                <Column style={{ width: 44 }}>
                  <Text style={note(INK.stone)}>{d.day}</Text>
                </Column>
                <Column style={{ gap: 2 }}>
                  <Text style={{ fontSize: 17, lineHeight: 1.4, color: d.replacedBy ? INK.stone : INK.ink }}>
                    {d.replacedBy ? <Span style={{ textDecoration: "line-through" }}>{d.text}</Span> : d.text}
                  </Text>
                  <Text style={note(INK.stone)}>
                    #{d.handle}{d.replacedBy ? ` → replaced by #${d.replacedBy}` : ""}
                  </Text>
                </Column>
              </Row>
            ))}
          </Column>
        )}

        {v.learned.length > 0 && (
          <Column style={{ gap: 12, padding: [20, 0, 0, 0], border: { top: { width: 1, style: "solid", color: INK.rule } } }}>
            <Text style={{ apply: ["voice"], fontSize: 24, lineHeight: 1.1 }}>and what you learned</Text>
            {v.learned.map((l) => (
              <Text key={l.handle} style={{ fontSize: 16 }}>
                {l.text} <Span style={{ fontFamily: FACES.note, fontSize: 14, color: INK.stone }}>#{l.handle}</Span>
              </Text>
            ))}
          </Column>
        )}

        <Text style={{ fontSize: 15, color: INK.stone }}>
          Plus {plural(v.worked, "thing")} you worked on and {plural(v.tasksDone, "task")} you finished.
        </Text>
        <Button href={`${v.appUrl}/#workspace`}>Open your workspace</Button>
      </Section>

      <Section style={{ backgroundColor: INK.ink, padding: [32, PAD, 36, PAD], gap: 14, mobile: { padding: [28, 24] } }}>
        <Text style={{ apply: ["voice"], color: INK.cream, fontSize: 26, lineHeight: 1.1 }}>
          see you next sunday<Span style={{ color: INK.dot }}>.</Span>
        </Text>
        <Text style={note("#c9c2b6")}>
          you get this because you turned on the sunday letter for {v.owner}&apos;s memory.{" "}
          <Link href={`${v.appUrl}/?letter=off#workspace`} style={{ color: INK.cream }}>Unsubscribe from the Sunday letter</Link>
        </Text>
      </Section>
    </Email>
  );
}

export default template({
  id: "memorable.WeekLetter",
  version: "1.0.0",
  label: "The Sunday letter (email)",
  guidance:
    "A weekly email written from one person's memoRABLE log. Quote entries as written. Lowercase voice lines, sentence-case content. No emoji, no exclamation marks, one tomato dot per band at most.",
  root: "Email",
  fields: letterFields,
  rules: {
    plugins: { lint: lint({ kind: "marketing" }) },
    require: { lint: ["unsubscribe", "link-text", "lang", "contrast"], core: ["layout/overflow"] },
    links: { domains: ["memo-rable.vercel.app"] },
    root: { lang: true, previewText: true },
  },
  example: sampleWeek,
  render: (v) => <LetterEmail {...(v as unknown as LetterValues)} />,
});
