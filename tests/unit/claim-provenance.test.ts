/**
 * A claim must trace to something the author actually asserted.
 *
 * An imperative line in a guide instructs the reader ("Add 2.5 kg ...",
 * "Check in at the kiosk"); it is not a goal the author set or a choice
 * the author settled. Only a line carrying its own decision marker
 * ("We decided to ...", "We will ...") or a stated requirement may back
 * a goal claim or a "settles on" citation. A policy penalty
 * ("Missed appointments carry a fee") states a standing rule; an actual
 * incident ("We were charged Rs 500 after missing the slot") reports
 * trouble — only the incident earns a problem claim. And a consequence
 * embedded mid-sentence keeps the source's words, not a sentence-case
 * capital that only made sense at the start of a line.
 */
import { describe, expect, it } from "vitest";
import { composeRecall } from "@/understanding/recall";
import type { Intent } from "@/understanding/intent";

const INTENT: Intent = {
  kind: "guide",
  verb: "guides",
  subject: "the Goa flight",
  instructional: true,
  measured: false,
  sequenced: false,
};

function recall(overrides: Partial<Parameters<typeof composeRecall>[0]>) {
  return composeRecall({
    intent: INTENT,
    concepts: [],
    signals: [],
    decisions: [],
    risks: [],
    timeline: [],
    actions: [],
    fallback: "",
    ...overrides,
  });
}

describe("goal claims require a stated goal or decision", () => {
  it("does not invent a goal from an imperative rule", () => {
    const r = recall({
      decisions: [{ text: "Add 2.5 kg to squat every session if all reps pass", commitment: "committed" }],
      risks: [{ risk: "Missed two sessions in a row?", severity: "low" }],
    });
    expect(r.goal).toBe("");
    expect(r.hook).not.toMatch(/primary goal/i);
    expect(r.summary).not.toMatch(/add 2\.5 kg/i);
  });

  it("keeps a goal from a stated decision", () => {
    const r = recall({
      decisions: [{ text: "We decided to ship the beta on Friday", commitment: "committed" }],
    });
    expect(r.goal).toBe("Ship the beta on Friday");
  });

  it("keeps a stated requirement in its own words", () => {
    const r = recall({
      decisions: [{ text: "The system must keep an audit trail of every edit", commitment: "committed" }],
    });
    expect(r.goal).toBe("The system must keep an audit trail of every edit");
    expect(r.goal).not.toMatch(/^enable the system must/i);
  });

  it("still earns Enable for a settled noun-phrase decision", () => {
    const r = recall({
      decisions: [{ text: "Audit trail and edit history", commitment: "committed" }],
    });
    expect(r.goal).toBe("Enable audit trail and edit history");
  });

  // Found by varied-document sweep (postmortem, agenda, caterer notes): a
  // stated decision whose action verb is missing from the hand-kept
  // imperative list rendered "Enable freeze ...", "Enable hold ...",
  // "Enable go with ..." - broken English on every head including the
  // qualified base. The "to" the decision marker already carries (or the
  // promise form itself) is the structural signal the remainder is a verb
  // phrase; no verb list can carry that contract.
  it.each([
    ["We decided to freeze pricing-service deploys during Diwali week", "Freeze pricing-service deploys during Diwali week"],
    ["We will hold the launch until the guardrail dashboard is live", "Hold the launch until the guardrail dashboard is live"],
    ["We decided to go with Annapoorna and will pay the advance this week", "Go with Annapoorna and will pay the advance this week"],
  ])("renders the settled action of %s without an Enable prefix", (text, goal) => {
    const r = recall({ decisions: [{ text, commitment: "committed" }] });
    expect(r.goal).toBe(goal);
    expect(r.goal).not.toMatch(/^enable (?:freeze|hold|go)\b/i);
  });

  it("consumes the preposition of a decided-on noun phrase", () => {
    const r = recall({
      decisions: [{ text: "We decided on daily standups", commitment: "committed" }],
    });
    expect(r.goal).toBe("Enable daily standups");
  });
});

describe("compound trouble after an assurance keeps its claim", () => {
  // Publisher's independent clause probe (memo15-clauses): every shape that
  // joins real trouble to an assurance must keep its claim on any head.
  // Locked as baseline contract after the inverted-assurance guard was
  // withdrawn (no regex layer can positively certify clause-freeness).
  it.each([
    "We lost no records and missed the deadline",
    "We lost no records although two users were harmed",
    "We lost no records while the server failed",
    "We lost no records before the server crashed",
    "We lost no records after the server failed",
    "We lost no records despite the server failing",
    "We lost no records following the outage",
    "We lost no records nor missed any deadlines",
    "We lost no records during the transfer and backup",
  ])("keeps the claim in %s", (risk) => {
    const r = recall({ risks: [{ risk, severity: "high" }] });
    expect(r.problem).toMatch(/lost no records/i);
  });
});

describe("settles-on citations require a settled decision", () => {
  it("does not cite reader instructions as commitments", () => {
    const r = recall({
      decisions: [
        { text: "Check in at the designated kiosk two days before the flight", commitment: "committed" },
        { text: "Arrive 15 minutes early to complete paperwork", commitment: "committed" },
      ],
    });
    expect(r.summary).not.toMatch(/settles on/i);
    expect(r.summary).not.toMatch(/check in/i);
  });

  it("frames a settled decision as the goal instead of citing instructions", () => {
    const r = recall({
      decisions: [
        { text: "Check in at the designated kiosk two days before the flight", commitment: "committed" },
        { text: "Cleaning the data first and using many small prompts", commitment: "committed" },
      ],
    });
    expect(r.goal).toBe("Enable cleaning the data first and using many small prompts");
    expect(r.summary).not.toMatch(/check in/i);
  });

  it("does not cite precautions or logistics as commitments", () => {
    const r = recall({
      decisions: [{ text: "Do not eat for 2 hours before the procedure", commitment: "committed" }],
    });
    expect(r.summary).not.toMatch(/settles on/i);
  });
});

describe("a consequence embedded mid-sentence keeps source casing", () => {
  it("lowercases a mid-sentence article", () => {
    const r = recall({
      risks: [{ risk: "Settlement reports failed twice", consequence: "A growing reconciliation backlog", severity: "high" }],
    });
    expect(r.problem).toContain("causing a growing reconciliation backlog");
  });

  it("preserves an acronym", () => {
    const r = recall({
      risks: [{ risk: "Egress traffic doubled", consequence: "AWS egress charges tripling", severity: "high" }],
    });
    expect(r.problem).toContain("causing AWS egress charges tripling");
  });
});

describe("problem claims: policy boilerplate claims at public-baseline parity", () => {
  // Public-baseline parity (publisher veto-family review, Oct 27): every
  // suppression guard the chain added leaked an affirmed incident through
  // its interior, and no regex-layer enumeration can certify that what
  // surrounds a policy/question/score is harmless. The whole veto family is
  // withdrawn; problem claiming returns to the public ed4c60c baseline —
  // every risk line claims, and a miss fails toward visibility, never
  // toward suppression.
  it("claims a standing policy penalty, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "medium" }],
    });
    expect(r.problem).toBe("Missed appointments without notice carry a Rs 500 fee");
  });

  it("keeps a claim from an actual incident", () => {
    const r = recall({
      risks: [{ risk: "We were charged Rs 500 after missing the 12 October slot", severity: "medium" }],
    });
    expect(r.problem).toContain("charged Rs 500");
  });

  it("keeps a policy line that asserts its own consequence", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments carry a Rs 500 fee", consequence: "Lost revenue every month", severity: "high" }],
    });
    expect(r.problem).toContain("Missed appointments carry a Rs 500 fee");
    expect(r.problem).toContain("causing Lost revenue every month");
  });
});

describe("promises, negations and uncertainty are not settled goals", () => {
  const cases: Array<[string, string]> = [
    ["We will not ship until security approves", "negated conditional"],
    ["We will probably ship next month", "hedged promise"],
    ["We will miss the deadline unless staffing improves", "warning, not a goal"],
    ["We decided not to ship the beta", "negative decision"],
    ["Provide your passport at the desk", "enablement-verb instruction"],
    ["Build the demo only if all tests pass", "conditional instruction"],
  ];
  for (const [text, why] of cases) {
    it(`claims no goal for: ${text} (${why})`, () => {
      const r = recall({ decisions: [{ text, commitment: "committed" }] });
      expect(r.goal).toBe("");
      expect(r.hook).not.toMatch(/primary goal/i);
    });
  }

  it("keeps an explicit decision to ship", () => {
    const r = recall({
      decisions: [{ text: "We decided to ship the beta on Friday", commitment: "committed" }],
    });
    expect(r.goal).toBe("Ship the beta on Friday");
  });
});

describe("penalty claims distinguish incidents from standing rules", () => {
  it("claims a penalty with an event anchor it cannot prove conditional", () => {
    // Ruling conflict, resolved toward the safe direction: the 8c-era
    // ruling withheld "after an outage" (a corroborating noun asserts
    // nothing), but the Oct 27 boundary ruling requires "We are subject to
    // a penalty after the server crashed" to be CLAIMED. Separating
    // "after <noun phrase>" from "after <finite clause>" needs real parsing
    // (morphology misses irregular verbs: "after the server broke" would
    // suppress an affirmed incident), so any "after ..." residue defeats
    // the veto and both shapes return to the public-baseline claim.
    const r = recall({
      risks: [{ risk: "Two missed deliveries incur a penalty after yesterday's outage", severity: "high" }],
    });
    expect(r.problem).not.toBe("");
    const r2 = recall({
      risks: [{ risk: "Missed deliveries incur a penalty after an outage", severity: "high" }],
    });
    expect(r2.problem).not.toBe("");
  });

  it("claims a policy commencement, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "From today late returns are subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toBe("From today late returns are subject to a penalty");
  });

  it("keeps a first-party dated incident report", () => {
    const r = recall({
      risks: [{ risk: "We missed the slot on 2026-10-12 and are subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toContain("missed the slot on 2026-10-12");
  });

  it("keeps a first-party past slot-miss that became subject to a penalty", () => {
    const r = recall({
      risks: [{ risk: "We missed the slot yesterday and are subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toContain("missed the slot yesterday");
  });

  it("keeps a mixed commencement plus first-party occurred event", () => {
    const r = recall({
      risks: [{ risk: "From today policy changes; we missed yesterday's slot and were charged a penalty", severity: "high" }],
    });
    expect(r.problem).toContain("we missed yesterday's slot");
  });

  it("claims a hypothetical penalty, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "If we missed the slot, we are subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toBe("If we missed the slot, we are subject to a penalty");
  });

  // Publisher's assurance-boundary review (Oct 27): the unanchored
  // NEGATED_ASSURANCE guard added in 03a9435 suppressed "We are not late
  // although two users were harmed" - real trouble the public ed4c60c
  // retains. An unanchored assurance pattern cannot see what follows it;
  // the guard is withdrawn. "We did not miss the slot" returns to the
  // public-baseline false claim - documented debt, not a solved problem.
  it("returns to public-baseline behavior on a bare negated assurance", () => {
    const r = recall({
      risks: [{ risk: "We did not miss the slot and are not subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toMatch(/did not miss the slot/i);
  });
});

describe("affirmed incidents always claim; pure forms claim at public-baseline parity", () => {
  // Publisher's cumulative-policy boundary rows (Oct 27): sentence-wide
  // vetoes suppressed every one of these; public ed4c60c retains them all.
  // The boundary: a veto must account for the WHOLE line - any residue it
  // cannot explain defeats it, no word list needed for the residue.
  it.each([
    "Late arrivals incur a fee although two users were harmed",
    "Late returns are subject to a charge and the server failed",
    "Appointments carry a cancellation fee. The database crashed.",
    "Two users were harmed and late returns are subject to a charge",
    "We are subject to a penalty after the server crashed",
    "The database failed. Why were two users harmed?",
  ])("keeps the claim in %s", (risk) => {
    const r = recall({ risks: [{ risk, severity: "high" }] });
    expect(r.problem).not.toBe("");
  });

  it("claims a line that is wholly a policy penalty, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "medium" }],
    });
    expect(r.problem).toBe("Missed appointments without notice carry a Rs 500 fee");
  });

  it("claims a line that is wholly a question, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "Why were two users harmed?", severity: "high" }],
    });
    expect(r.problem).toBe("Why were two users harmed?");
  });

  it("claims a hypothetical policy penalty, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "If we missed the slot, we are subject to a penalty", severity: "high" }],
    });
    expect(r.problem).toBe("If we missed the slot, we are subject to a penalty");
  });
});

describe("negated assurance joined to real trouble keeps its claim", () => {
  // Publisher's memo-ed4/memo17-assurance-boundary rows: every one of these
  // is retained on public ed4c60c and was suppressed on 03a9435..7ead7fc.
  it.each([
    "We are not late although two users were harmed",
    "We are not late but two users were harmed",
    "We did not fail although two users were harmed",
    "We did not fail but two users were harmed",
    "We are not late although two users were harmed and the server failed",
  ])("keeps the claim in %s", (risk) => {
    const r = recall({ risks: [{ risk, severity: "high" }] });
    expect(r.problem).not.toBe("");
  });
});

describe("a consequence keeps names and places capitalized", () => {
  it("preserves a person's name", () => {
    const r = recall({
      risks: [{ risk: "Reports failed twice", consequence: "Alice losing access to the portal", severity: "high" }],
    });
    expect(r.problem).toContain("causing Alice losing access to the portal");
  });

  it("preserves a place name", () => {
    const r = recall({
      risks: [{ risk: "Reports failed twice", consequence: "London operations stopping", severity: "high" }],
    });
    expect(r.problem).toContain("causing London operations stopping");
  });
});

describe("outstanding work stays visible without a framing claim", () => {
  it("claims the policy risk and keeps the action visible on the framed document", () => {
    // Same input as the former withholding case: with the veto family
    // withdrawn the risk claims (public baseline), the document is framed,
    // and the outstanding-work clause stays visible in the summary.
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "medium" }],
      actions: [{ task: "Call us at least 24 hours before your slot if you need to move it", status: "pending" }],
      fallback: "Bright Smile Dental Clinic, 45 MG Road, Bengaluru 560001.",
    });
    expect(r.problem).toBe("Missed appointments without notice carry a Rs 500 fee");
    expect(r.summary).toContain("Outstanding work (one): Call us at least 24 hours before your slot if you need to move it.");
  });

  it("shows no new clause when the baseline selection was also silent", () => {
    // Compatibility boundary: a document neither the corrected framing nor
    // the exact baseline selection frames must not newly acquire the clause.
    const r = recall({
      intent: { ...INTENT, subject: "the studio booking" },
      actions: [{ task: "Confirm the session by Thursday", status: "pending" }],
    });
    expect(r.summary).not.toContain("Outstanding work");
    expect(r.summary).toContain("pins down the studio booking.");
  });

  it("shows the clause when the baseline selection framed the document", () => {
    // The baseline claimed this policy shape as the primary problem; the
    // corrected claim layer withholds it — visibility is preserved.
    const r = recall({
      intent: { ...INTENT, subject: "the studio booking" },
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "high" }],
      actions: [{ task: "Confirm the session by Thursday", status: "pending" }],
    });
    expect(r.summary).toContain("Outstanding work (one): Confirm the session by Thursday.");
  });
});
describe("promise claims keep their full conditions verbatim", () => {
  it("keeps a long conditional promise whole, condition included", () => {
    const text = "We will ship the beta only when security approves the final build and QA signs off on the release notes";
    const r = recall({ decisions: [{ text, commitment: "committed" }] });
    expect(r.goal).toBe("Ship the beta only when security approves the final build and QA signs off on the release notes");
  });

  it("keeps a short conditional promise with its condition", () => {
    const r = recall({
      decisions: [{ text: "We will ship if security approves", commitment: "committed" }],
    });
    expect(r.goal).toBe("Ship if security approves");
  });

  it("claims no goal for a misfortune projection", () => {
    const r = recall({
      decisions: [{ text: "We will miss the deadline unless staffing improves", commitment: "committed" }],
    });
    expect(r.goal).toBe("");
    expect(r.hook).not.toMatch(/primary goal/i);
  });

  it("claims no goal for a hedged promise", () => {
    const r = recall({
      decisions: [{ text: "We will probably ship next month", commitment: "committed" }],
    });
    expect(r.goal).toBe("");
  });
});

describe("the combined summary never exceeds its budget", () => {
  const longOpening = Array.from({ length: 130 }, (_, i) => `w${i}`).join(" ");
  const notice = "Call us at least 24 hours before your slot if you need to move it";

  // A policy-shaped risk: with the veto family withdrawn, corrected and
  // baseline selections both claim it, the document is framed, and the
  // outstanding-work clause is visible.
  const baselineFramingRisk = [
    { risk: "Missed appointments without notice carry a Rs 500 fee", severity: "high" as const },
  ];

  it("keeps the whole outstanding clause on the framed document", () => {
    const r = recall({
      risks: baselineFramingRisk,
      fallback: longOpening,
      actions: [{ task: notice, status: "pending" }],
    });
    expect(r.summary.split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(r.summary).toContain(notice + ".");
    expect(r.summary).not.toMatch(/\.\s+\./);
  });

  it("keeps four long actions whole and within budget", () => {
    const longTask = (n: number) =>
      `Coordinate item ${n} with the vendor and reconcile the report by Thursday`;
    const r = recall({
      risks: baselineFramingRisk,
      fallback: longOpening,
      actions: [1, 2, 3, 4].map((n) => ({ task: longTask(n), status: "pending" as const })),
    });
    expect(r.summary.split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(r.summary).toContain("by Thursday");
  });
});

describe("clause joins keep a sentence boundary", () => {
  it("separates a non-terminal opening from the waiting clause", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "high" }],
      fallback: "Bright Smile Dental Clinic 45 MG Road, Bengaluru 560001 Phone: 080-4123-8890",
      actions: [{ task: "Call us at least 24 hours before your slot if you need to move it", status: "pending" }],
    });
    expect(r.summary).toContain("080-4123-8890. Outstanding work (one):");
    expect(r.summary).not.toMatch(/\.\s+\./);
  });

  it("preserves a terminal question mark without doubling", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "high" }],
      fallback: "Can we still move the slot?",
      actions: [{ task: "Call us at least 24 hours before your slot if you need to move it", status: "pending" }],
    });
    expect(r.summary).toContain("slot? Outstanding work (one):");
    expect(r.summary).not.toContain("?.");
  });

  it("keeps an ellipsis terminal without adding a period", () => {
    const r = recall({
      risks: [{ risk: "Missed appointments without notice carry a Rs 500 fee", severity: "high" }],
      fallback: "The clinic wrote back saying the slot could move…",
      actions: [{ task: "Call us at least 24 hours before your slot if you need to move it", status: "pending" }],
    });
    expect(r.summary).toContain("move… Outstanding work (one):");
    expect(r.summary).not.toContain("…. ");
  });
});

describe("the settles-on clause quotes whole or omits", () => {
  it("omits a decision whose condition would be cut", () => {
    const r = recall({
      decisions: [
        {
          text: "We will ship the beta to all regions only when security approves the final build and QA signs off on the release notes and legal clears the privacy review for every market",
          commitment: "committed",
        },
      ],
    });
    expect(r.summary).not.toContain("settles on");
    expect(r.summary).not.toContain("only when.");
  });

  it("quotes a short commitment whole", () => {
    // A decision whose claim is withheld (misfortune) leaves the document
    // unframed; the settles-on citation keeps the condition whole.
    const r = recall({
      intent: { ...INTENT, subject: "the rollout" },
      decisions: [{ text: "We will miss the deadline unless staffing improves", commitment: "committed" }],
    });
    expect(r.summary).toContain("It settles on we will miss the deadline unless staffing improves.");
  });
});

describe("problem claims: questions claim at public-baseline parity", () => {
  it("claims an interrogative risk, as the public baseline does", () => {
    const r = recall({
      risks: [{ risk: "Missed two sessions in a row?", severity: "low" }],
      fallback: "Coach: Asha Verma. Start week of November 3, 2026.",
    });
    expect(r.problem).toBe("Missed two sessions in a row?");
  });

  it("keeps a problem claim from an occurred report", () => {
    const r = recall({
      risks: [{ risk: "We missed two sessions in a row", severity: "low" }],
    });
    expect(r.problem).toMatch(/missed two sessions/i);
  });

  it("keeps outstanding work visible when the claimed problem is a question", () => {
    const r = recall({
      risks: [{ risk: "Missed two sessions in a row?", severity: "low" }],
      actions: [{ task: "Add 2.5 kg to squat every session if all reps pass", status: "pending" }],
      fallback: "Coach: Asha Verma. Start week of November 3, 2026. Train Monday, Wednesday, Friday.",
    });
    expect(r.problem).toBe("Missed two sessions in a row?");
    expect(r.summary).toMatch(/outstanding work/i);
    expect(r.summary).toMatch(/add 2\.5 kg/i);
  });
});

describe("framing sentences are whole or omitted, never cut mid-sentence", () => {
  it("does not cut an instruction mid-way when the budget runs out", () => {
    const r = recall({
      risks: [{ risk: "Blocked nose and sinus pressure", because: "One week", severity: "low" }],
      fallback:
        "Dr. Anjali Rao, ENT October 24, 2026 Patient: Charan Rathore, 29M Blocked nose and sinus pressure since one week. Continue the nasal spray for 2 weeks. Steam inhalation twice daily.",
    });
    expect(r.summary).not.toMatch(/continue the nasal(?! spray)/i);
    expect(r.summary).toMatch(/one week/i);
  });

  it("omits a later sentence whole rather than cutting its numbers", () => {
    const r = recall({
      risks: [
        {
          risk: "Two suppliers missed delivery windows twice",
          consequence: "causing stockouts in 14 stores",
          severity: "high",
        },
      ],
      fallback:
        "Revenue grew 12% quarter over quarter to Rs 4.2 crore. Repeat purchase rate improved from 31% to 36%. Return rate worsened from 4.1% to 5.3%.",
    });
    expect(r.summary).not.toMatch(/return rate worsened(?! from)/i);
    expect(r.summary).toMatch(/36%/);
  });
});

describe("framing tolerates abbreviations and overlong openers", () => {
  it("does not split at abbreviations like incl. or initials", () => {
    const r = recall({
      decisions: [{ text: "We decided to shift all appointments to the first floor during the closure", commitment: "committed" }],
      fallback:
        "Dr. Rao and Mr. Iyer reviewed the plan on Oct. 12. The ground floor, incl. the reception and pharmacy, closes for six weeks.",
    });
    expect(r.summary).not.toMatch(/incl\.?$/i);
    expect(r.summary).toMatch(/reviewed the plan/i);
  });

  it("stops at an overlong opening sentence instead of cutting it mid-clause or cherry-packing later ones", () => {
    const r = recall({
      risks: [{ risk: "Replication lag kept growing during the cutover", severity: "high" }],
      fallback:
        "The database migration to the new cluster overran the planned four hour maintenance window by another three full hours because the replication lag kept growing during the cutover. Rollback completed cleanly. No data was lost.",
    });
    expect(r.summary).not.toMatch(/because the replication\.?$/i);
    // Packing later good-news sentences after dropping the overrun would
    // cherry-pick a positive frame: the contiguous prefix stops instead.
    expect(r.summary).not.toMatch(/rollback completed cleanly/i);
  });
});

describe("assurances are not problems", () => {
  // Publisher's actual-diff qualification correction (Oct 27): the anchored
  // negated-assurance guard from 5b96447 suppressed "No records were lost
  // although two users were harmed" - its lazy object span subsumes any
  // function word, so the misfortune verb list alone decided suppression.
  // The guard is withdrawn; "No data was lost" returns to the baseline
  // false claim, documented open debt until a structural signal exists.
  it("keeps a compound clause that reports real trouble", () => {
    const r = recall({
      risks: [{ risk: "We missed the slot and lost the deposit", severity: "high" }],
    });
    expect(r.problem).toMatch(/missed the slot/i);
  });
});

describe("assurance joined to real trouble keeps its claim", () => {
  // Publisher's memo13-assurance-review rows: on 13 the although-compound
  // was suppressed (regression vs sole-qualified 03a9435). Locked so any
  // future assurance guard must preserve every one of these.
  it.each([
    "No records were lost although two users were harmed",
    "No records were lost before the server crashed",
    "No records were lost after the server failed",
    "Nothing was lost before the server crashed",
  ])("keeps the claim in %s", (risk) => {
    const r = recall({ risks: [{ risk, severity: "high" }] });
    expect(r.problem).toMatch(/lost/i);
  });
});

describe("an overlong first sentence is whole or omitted, never cut", () => {
  // Publisher probe on packet 9: a 28-word clinical instruction as the sole
  // opening sentence fell back to the comma/dash shorten and ended
  // "do not use if you" - a medical condition cut mid-way.
  const CLINICAL =
    "Take the prescribed nasal spray twice daily for fourteen days only after checking with your doctor and do not use if you develop a rash or severe dizziness";

  it("omits an overlong opening whole from a framed summary", () => {
    const r = recall({
      risks: [{ risk: "Severe dizziness reported after the spray", consequence: "causing two clinic visits", severity: "high" }],
      fallback: CLINICAL,
    });
    expect(r.summary).not.toMatch(/do not use if you/i);
    expect(r.summary).not.toMatch(/take the prescribed/i);
  });

  it("keeps the same sentence whole on the unframed path", () => {
    const r = recall({ fallback: CLINICAL });
    expect(r.summary).toContain(CLINICAL);
  });
});


describe("an opening prefix never drops a prerequisite and keeps its dependent", () => {
  // Publisher probe on 5b96447: dropping the overlong prerequisite sentence
  // and packing the dependent one promoted "Only then continue the
  // medication" without the clinician-confirmation condition.
  const PREREQUISITE =
    "If a patient has any of the listed warning symptoms including fever and dizziness after taking the prescribed medication then a clinician must first confirm treatment safety. Only then continue the medication.";

  it("never renders a dependent instruction without its prerequisite", () => {
    const r = recall({
      risks: [{ risk: "Two patients reported dizziness after the spray", consequence: "causing clinic visits", severity: "high" }],
      fallback: PREREQUISITE,
    });
    expect(r.summary).not.toMatch(/only then continue/i);
    expect(r.summary).not.toMatch(/clinician must first/i);
  });

  it("keeps the same prerequisite pair whole on the unframed path", () => {
    const r = recall({ fallback: PREREQUISITE });
    expect(r.summary).toMatch(/clinician must first confirm treatment safety/i);
    expect(r.summary).toMatch(/only then continue the medication/i);
  });
});

describe("conditional-goal availability contract (baseline restored)", () => {
  // Publisher differential on 7a24d20: these structured committed decisions
  // were all retained on the qualified base 03a9435 and must stay retained.
  // The withdrawn CONDITIONAL_OPEN guard withheld them; the guard is removed
  // pending a source-grounded contract with independent evidence.
  it("keeps a fronted condition with a contracted first-person commitment", () => {
    const r = recall({
      decisions: [{ text: "If QA approves, we'll ship the beta on Friday", commitment: "committed" }],
    });
    expect(r.goal).toMatch(/QA approves/i);
    expect(r.goal).toMatch(/ship the beta on Friday/i);
  });

  it("keeps a fronted condition with an organizational commitment", () => {
    const r = recall({
      decisions: [{ text: "If QA approves, the company will ship the beta on Friday", commitment: "committed" }],
    });
    expect(r.goal).toMatch(/the company will ship the beta on Friday/i);
  });

  it("keeps a when-fronted condition with a named-owner commitment", () => {
    const r = recall({
      decisions: [{ text: "When funding clears, Alice will launch the pilot", commitment: "committed" }],
    });
    expect(r.goal).toMatch(/funding clears/i);
    expect(r.goal).toMatch(/launch the pilot/i);
  });
});
