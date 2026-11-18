/**
 * The Sunday letter as a web page: the same week, with room. The page can draw
 * (Svg) and set type far larger than an inbox allows, so the recall number gets
 * its own column and the week gets a real chart.
 */
import { Button, Circle, Column, Grid, Heading, Link, Page, Rect, Row, Section, Span, Svg, Text, token } from "@hyper-elements/react";
import { template } from "@hyper-elements/react/template";
import { lint } from "@hyper-elements/lint";
import { headlineCount, range, shortDate } from "./email";
import { letterFields } from "./fields";
import { sampleWeek } from "./sample";
import { FACES, INK, fontFaces, letterTheme } from "./theme";
import { answerLink, type LetterValues } from "./week";

const W = 1080;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function Bars({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  const bw = 44, gap = 18, h = 150;
  return (
    <Svg width={7 * bw + 6 * gap} height={h + 2} viewBox={`0 0 ${7 * bw + 6 * gap} ${h + 2}`} title={`Entries per day: ${days.map((n, i) => `${DAYS[i]} ${n}`).join(", ")}`}>
      {days.map((n, i) => {
        const bh = n ? 8 + Math.round((n / max) * (h - 8)) : 4;
        return <Rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={2} style={{ fill: n ? INK.cobalt : INK.rule }} />;
      })}
    </Svg>
  );
}

function Recall({ pct }: { pct: number }) {
  const W = 420;
  return (
    <Svg width={W} height={28} viewBox={`0 0 ${W} 28`} title={`Predicted recall ${pct}%, re-check below 90%`}>
      <Rect x={0} y={10} width={W} height={8} style={{ fill: INK.plum }} />
      <Rect x={0} y={10} width={Math.round((W * pct) / 100)} height={8} style={{ fill: INK.ink }} />
      <Rect x={Math.round(W * 0.9) - 1} y={0} width={2} height={28} style={{ fill: INK.ink }} />
      <Circle cx={Math.round((W * pct) / 100)} cy={14} r={7} style={{ fill: INK.ink }} />
    </Svg>
  );
}

const note = (color: string) => ({ apply: ["note" as const], color });

export function LetterPage(v: LetterValues) {
  const r = v.recheck;
  const replaced = v.decided.filter((d) => d.replacedBy).length;
  return (
    <Page theme={letterTheme} width={W} lang="en" fonts={[...fontFaces]} title={`Week ${v.week}, remembered · memoRABLE`}
      description={`${v.owner}'s week ${v.week}: ${headlineCount(v.decided.length)} decided${replaced ? `, ${replaced} replaced` : ""}.`}>
      <Section style={{ backgroundColor: token("colors.cobalt"), padding: [40, 48, 96, 48], gap: 64, mobile: { padding: [28, 24, 56, 24], gap: 40 } }}>
        <Row stackOnMobile={false}>
          <Column><Text style={note(INK.mist)}>memoRABLE · week {v.week} · {v.owner}</Text></Column>
          <Column><Text style={{ ...note(INK.mist), textAlign: "right" }}>{range(v.weekOf, v.weekEnd)}</Text></Column>
        </Row>
        <Column style={{ gap: 8 }}>
          <Text style={{ apply: ["voice"], color: INK.cream, fontSize: 56, lineHeight: 1, mobile: { fontSize: 32 } }}>this week you decided</Text>
          <Heading level={1} style={{ color: INK.cream, fontSize: 168, letterSpacing: -7, lineHeight: 0.9, mobile: { fontSize: 64, letterSpacing: -2 } }}>
            {headlineCount(v.decided.length)}<Span style={{ color: INK.dotOnCobalt }}>.</Span>
          </Heading>
        </Column>
        <Row style={{ gap: 32 }}>
          <Column><Text style={note(INK.mist)}>&gt; a working memory. notes-to-self, mostly.</Text></Column>
          <Column><Text style={note(INK.mist)}>&gt; written from your own log, on your device. no model read it.</Text></Column>
          <Column><Text style={note(INK.mist)}>&gt; {replaced ? `${replaced === 1 ? "one" : replaced} didn't last the week.` : "nothing was replaced."}</Text></Column>
        </Row>
      </Section>

      {r && (
        <Section style={{ backgroundColor: token("colors.pink"), padding: [88, 48], mobile: { padding: [48, 24] } }}>
          <Row style={{ gap: 56, alignItems: "end" }}>
            <Column style={{ gap: 24, flex: 3 }}>
              <Text style={{ apply: ["voice"], fontSize: 64, lineHeight: 0.95, mobile: { fontSize: 44 } }}>still true?</Text>
              <Heading level={2} style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: -1.4, mobile: { fontSize: 28 } }}>{r.text}</Heading>
              <Recall pct={r.recall} />
              <Text style={note(INK.plum)}>
                &gt; {r.kind === "decided" ? "decided" : "learned"} {shortDate(r.recordedOn)}, {r.reviews ? `confirmed ${r.reviews === 1 ? "once" : `${r.reviews} times`}` : "never re-checked"}. below the line at 90%, it comes back.
              </Text>
              <Row style={{ gap: 12 }}>
                <Column style={{ width: 150, mobile: { width: "100%" } }}>
                  <Button href={answerLink(v.appUrl, r.handle, "holds")}>Still holds</Button>
                </Column>
                <Column style={{ width: 160, mobile: { width: "100%" } }}>
                  <Button href={answerLink(v.appUrl, r.handle, "changed")}
                    style={{ backgroundColor: INK.pink, color: INK.ink, border: { width: 2, style: "solid", color: INK.ink }, padding: [12, 20], hover: { backgroundColor: INK.cream } }}>
                    {r.kind === "decided" ? "It changed" : "I forgot"}
                  </Button>
                </Column>
                <Column hidden={{ mobile: true }} />
              </Row>
            </Column>
            <Column style={{ gap: 6, flex: 2 }}>
              <Heading level={2} style={{ fontSize: 180, letterSpacing: -9, lineHeight: 0.85, mobile: { fontSize: 96, letterSpacing: -4 } }}>
                {r.recall}<Span style={{ apply: ["voice"], fontSize: 72, letterSpacing: 0 }}>%</Span>
              </Heading>
              <Text style={note(INK.plum)}>&gt; likely you still remember why. &ldquo;still holds&rdquo; moves the next check {r.nextIfHolds} days out.</Text>
            </Column>
          </Row>
        </Section>
      )}

      <Section style={{ backgroundColor: token("colors.cream"), padding: [88, 48], gap: 56, mobile: { padding: [48, 24], gap: 36 } }}>
        <Row style={{ gap: 56, alignItems: "end" }}>
          <Column style={{ gap: 10 }}>
            <Text style={{ apply: ["voice"], fontSize: 52, lineHeight: 1, mobile: { fontSize: 36 } }}>the week, in order</Text>
            <Text style={note(INK.stone)}>&gt; one bar per day, by how much you wrote. {v.days.reduce((a, b) => a + b, 0)} entries in all.</Text>
          </Column>
          <Column style={{ gap: 8, width: 416, mobile: { width: "100%" } }}>
            <Bars days={v.days} />
            <Grid columns={7} stackOnMobile={false} style={{ gap: 18 }}>
              {DAYS.map((d) => <Text key={d} style={{ ...note(INK.stone), textAlign: "center" }}>{d[0]}</Text>)}
            </Grid>
          </Column>
        </Row>
        <Column style={{ gap: 0, border: { top: { width: 3, style: "solid", color: INK.ink } } }}>
          {v.decided.map((d) => (
            <Row key={d.handle} stackOnMobile={false} style={{ gap: 24, padding: [22, 0], border: { bottom: { width: 1, style: "solid", color: INK.rule } }, alignItems: "start" }}>
              <Column style={{ width: 72 }}><Text style={note(INK.stone)}>{d.day}</Text></Column>
              <Column style={{ gap: 4 }}>
                <Text style={{ fontFamily: FACES.display, fontSize: 26, lineHeight: 1.15, letterSpacing: -0.5, color: d.replacedBy ? INK.stone : INK.ink, mobile: { fontSize: 20 } }}>
                  {d.replacedBy ? <Span style={{ textDecoration: "line-through" }}>{d.text}</Span> : d.text}
                </Text>
                {d.replacedBy && (
                  <Text style={{ apply: ["voice"], fontSize: 22, color: INK.ink }}>replaced by &ldquo;{d.replacedText}&rdquo;</Text>
                )}
              </Column>
              <Column style={{ width: 90 }}><Text style={{ ...note(INK.stone), textAlign: "right" }}>#{d.handle}</Text></Column>
            </Row>
          ))}
        </Column>
      </Section>

      {v.learned.length > 0 && (
        <Section style={{ backgroundColor: token("colors.paper"), padding: [80, 48], gap: 32, mobile: { padding: [48, 24] } }}>
          <Text style={{ apply: ["voice"], fontSize: 44, lineHeight: 1, mobile: { fontSize: 32 } }}>and what you learned</Text>
          <Grid columns={2} style={{ gap: 24, rowGap: 24 }}>
            {v.learned.map((l) => (
              <Column key={l.handle} style={{ gap: 10, padding: [20, 0, 0, 0], border: { top: { width: 2, style: "solid", color: INK.ink } } }}>
                <Text style={{ fontSize: 22, lineHeight: 1.35 }}>{l.text}</Text>
                <Text style={note(INK.stone)}>#{l.handle}</Text>
              </Column>
            ))}
          </Grid>
          <Text style={{ fontSize: 17, color: INK.stone }}>Plus {v.worked} things you worked on and {v.tasksDone} tasks you finished.</Text>
        </Section>
      )}

      <Section style={{ backgroundColor: INK.ink, padding: [72, 48], gap: 20, mobile: { padding: [48, 24] } }}>
        <Text style={{ apply: ["voice"], color: INK.cream, fontSize: 56, lineHeight: 1, mobile: { fontSize: 36 } }}>
          see you next sunday<Span style={{ color: INK.dot }}>.</Span>
        </Text>
        <Row style={{ gap: 32 }}>
          <Column><Text style={note("#c9c2b6")}>&gt; this page was written from {v.owner}&apos;s memoRABLE log, in the browser.</Text></Column>
          <Column><Text style={note("#c9c2b6")}><Link href={`${v.appUrl}/#workspace`} style={{ color: INK.cream }}>Open the workspace</Link> · <Link href={`${v.appUrl}/?letter=off#workspace`} style={{ color: INK.cream }}>Unsubscribe from the Sunday letter</Link></Text></Column>
        </Row>
      </Section>
    </Page>
  );
}

export default template({
  id: "memorable.WeekPage",
  version: "1.0.0",
  label: "The Sunday letter (web page)",
  guidance: "The week as a shareable page. Same rules as the email: quote entries as written, one dot per band.",
  root: "Page",
  fields: letterFields,
  rules: {
    plugins: { lint: lint() },
    require: { lint: ["link-text", "lang", "contrast", "heading-order", "heading-one"], core: ["layout/overflow"] },
    links: { domains: ["memo-rable.vercel.app"] },
    root: { lang: true },
  },
  // The example is typed as the values the components take; the template checks it against its fields.
  example: sampleWeek as never,
  render: (v) => <LetterPage {...(v as unknown as LetterValues)} />,
});
