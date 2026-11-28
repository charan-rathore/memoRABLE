import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@hyper-elements/react";
import { check } from "@hyper-elements/react/template";
import { DailyEngine } from "@/daily/engine";
import { MemoryStore } from "@/daily/store";
import { answerLink, isoWeek, mondayOf, weekLetter, ymd } from "@/letter/week";
import { readLetterRequest, withoutLetterParams } from "@/letter/deep-link";
import WeekLetter, { headlineCount, LetterEmail } from "@/letter/email";
import WeekPage from "@/letter/page";
import DecisionRecord from "@/letter/record";
import WeekCard, { cardFootnote } from "@/letter/card";
import { sampleWeek } from "@/letter/sample";

const DAY = 86_400_000;

async function week() {
  let t = Date.parse("2026-11-16T09:00:00.000Z"); // a Monday
  const now = () => new Date(t);
  const e = await DailyEngine.open({ workspaceId: "w", store: new MemoryStore(), now, deviceId: "t" });
  return { e, now, advance: (ms: number) => { t += ms; } };
}

describe("the week's values", () => {
  it("finds Monday and the ISO week", () => {
    expect(ymd(mondayOf(new Date("2026-11-20T12:00:00Z")))).toBe("2026-11-16"); // a Friday in every zone
    expect(isoWeek(new Date("2026-11-18T12:00:00Z"))).toBe(47);
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe(53);
  });

  it("counts the week's entries per day and strikes through replaced decisions", async () => {
    const { e, now, advance } = await week();
    const redis = await e.record({ kind: "decided", text: "Decided to cache sessions in Redis" });
    advance(2 * DAY);
    await e.record({ kind: "decided", text: "Decided to use Edge Config instead", supersedes: redis.id });
    await e.record({ kind: "learned", text: "Learned: retries need idempotency keys" });
    const v = weekLetter(e.workspace, now(), { appUrl: "https://memo-rable.vercel.app" });
    expect(v.week).toBe(47);
    expect(v.days).toEqual([1, 0, 2, 0, 0, 0, 0]);
    expect(v.decided).toHaveLength(2);
    const first = v.decided.find((d) => d.handle === redis.handle)!;
    expect(first.replacedBy).toBeDefined();
    expect(v.learned.map((l) => l.text)).toEqual([expect.stringContaining("idempotency")]);
  });

  it("leaves deleted entries out", async () => {
    const { e, now } = await week();
    const d = await e.record({ kind: "decided", text: "Decided to move to Kafka" });
    await e.delete(d.id);
    expect(weekLetter(e.workspace, now()).decided).toEqual([]);
  });

  it("asks to re-check only what recall has let slip below 90%, never a replaced decision", async () => {
    const { e, now, advance } = await week();
    const old = await e.record({ kind: "decided", text: "Decided to use REST" });
    await e.record({ kind: "decided", text: "Decided to use gRPC instead", supersedes: old.id });
    expect(weekLetter(e.workspace, now()).recheck).toBeUndefined();
    advance(30 * DAY);
    const r = weekLetter(e.workspace, now()).recheck;
    expect(r?.text).toContain("gRPC");
    expect(r!.recall).toBeLessThan(90);
  });
});

describe("the letter's links", () => {
  it("carry the question, not the change", () => {
    const href = answerLink("https://memo-rable.vercel.app", "ab12cd", "holds");
    expect(href).toBe("https://memo-rable.vercel.app/?still=ab12cd&answer=holds#workspace");
    expect(readLetterRequest(new URL(href).search)).toEqual({ kind: "answer", handle: "ab12cd", answer: "holds" });
  });

  it("refuse handles and answers they don't know", () => {
    expect(readLetterRequest("?still=../x&answer=holds").kind).toBe("none");
    expect(readLetterRequest("?still=ab12cd&answer=delete").kind).toBe("none");
    expect(readLetterRequest("?letter=off").kind).toBe("unsubscribe");
  });

  it("are taken out of the URL once read", () => {
    expect(withoutLetterParams("https://x.dev/?still=ab12cd&answer=holds&ref=mail#workspace")).toBe("/?ref=mail#workspace");
    expect(withoutLetterParams("https://x.dev/?letter=off#workspace")).toBe("/#workspace");
  });
});

describe("the templates", () => {
  it.each([
    ["email", WeekLetter],
    ["page", WeekPage],
    ["record", DecisionRecord],
    ["card", WeekCard],
  ] as const)("%s passes every rule on the example", (_, Tpl) => {
    const res = check(createElement(Tpl as never, sampleWeek as never));
    expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(res.valid).toBe(true);
    for (const r of res.rules) expect(r.status).toBe("passed");
  });

  it("writes counts as words, digits only past twelve", () => {
    expect(headlineCount(0)).toBe("nothing");
    expect(headlineCount(4)).toBe("four things");
    expect(headlineCount(13)).toBe("13 things");
  });

  it("puts only what's true in the card's footnote", () => {
    expect(cardFootnote({ ...sampleWeek, decided: [], recheck: undefined })).toBe(`> week ${sampleWeek.week}`);
  });

  it("renders an email with an unsubscribe link and the answer links", async () => {
    const { html, text } = await render(<LetterEmail {...sampleWeek} />);
    expect(html).toContain("?letter=off#workspace");
    expect(html).toContain(`still=${sampleWeek.recheck!.handle}&amp;answer=holds`);
    expect(text.toLowerCase()).toContain("four things.");
  });
});
