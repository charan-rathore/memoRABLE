/**
 * Umbrex market-research guidance pack.
 *
 * Method guidance distilled from Umbrex's PUBLIC playbook pages, retrieved
 * 2026-11-06 (initial read 2026-10-06). This is framework guidance, never
 * market data: the playbooks' worked examples (EV battery, SaaS HR-tech,
 * hydrogen electrolyzer) are illustrative and their numbers must not surface
 * as facts. Gated/unavailable chapters are named as not accessible - nothing
 * is claimed from them.
 */

export const GUIDANCE_RETRIEVED = "2026-11-06";

export interface GuidanceStep {
  id: string;
  title: string;
  guidance: string[];
  sources: string[];
  accessNotes?: string;
}

const MS = "https://umbrex.com/resources/market-sizing-playbook";
const CDD = "https://umbrex.com/resources/commercial-due-diligence-playbook-2025";

export const UMBREX_GUIDANCE_PACK: readonly GuidanceStep[] = [
  {
    id: "clarify",
    title: "0. Clarify the decision",
    guidance: [
      "State the decision this research feeds, geography, time horizon, precision band, and deadline before collecting anything.",
      "Ask what changes at $5B versus $500M: if the answer is nothing, the sizing precision is already sufficient.",
      "Run the eight-question kickoff: decision, deadline, exposure and irreversibility, magnitude that changes the choice, 3-5 value drivers, top uncertain hypotheses, precision/currency/time frame, veto holders.",
    ],
    sources: [`${MS}/scoping-and-framing-the-exercise/`, `${CDD}/`],
  },
  {
    id: "boundary",
    title: "1. Boundary sheet",
    guidance: [
      "Define the market in one sentence: defined customers buying a defined solution for a defined need.",
      "Keep an explicit in/out list with units, base year, currency, and real-vs-nominal stated.",
      "Anchor on customer need, not technology; segment only where economics differ; the boundary must be populatable with data.",
      "State TAM (ceiling at today's economics), SAM (serviceable), SOM (winnable this horizon) and which denominator any share uses.",
    ],
    sources: [`${MS}/foundations-of-market-sizing/`],
  },
  {
    id: "driver-tree",
    title: "2. Hypotheses and driver tree",
    guidance: [
      "Write 1-3 falsifiable hypotheses; a hypothesis that cannot be wrong is not a hypothesis.",
      "Decompose the decision variable into MECE drivers; every leaf carries a value, a source, and an A-C confidence grade.",
      "Run a +-50% rough cut first to find the swing variables before deep data work.",
    ],
    sources: [
      `${MS}/scoping-and-framing-the-exercise/`,
      `${MS}/hybrid-triangulation-and-sanity-check-techniques/`,
    ],
  },
  {
    id: "source-plan",
    title: "3. Source plan",
    guidance: [
      "Pick sources by question; prefer primary statistical and filing sources over aggregators.",
      "Pull-list equivalent: 3 years of filings, two in-scope industry series, one traffic/interest signal plus review corpus, one pricing lens, one macro driver.",
      "Keep a source register: URL, publisher, date, definition, coverage, bias, license.",
      "Vet each source for definition fit and recency; paywalled analyst data is 'not accessible', never estimated.",
    ],
    sources: [`${CDD}/data-collection-and-research-techniques/`, `${MS}/data-collection-and-research-techniques/`],
    accessNotes:
      "Market Sizing Ch3 public page returned HTTP 520 (server error) on 2026-11-06 - chapter access unverified, not confirmed paywalled. CDD Ch4 public page readable.",
  },
  {
    id: "sizing",
    title: "4. Multi-lens sizing",
    guidance: [
      "Run top-down and bottom-up as independent lenses; the same dataset under two lenses is not independent.",
      "Top-down: base metric matching the boundary, cascade of at most 4 sourced ratios, realized price, growth from causal drivers not CAGR.",
      "Bottom-up: atomic unit of demand, unit universe from multiple sources, adoption curve calibrated to a historical analogue, churn and channel leakage included.",
      "Reconcile lenses within +-15% or explain the bridge; report ranges (P10/P50/P90), never single points.",
      "Order-of-magnitude audit: penetration ceilings, capacity bounds, per-capita human limits.",
    ],
    sources: [
      `${MS}/top-down-market-sizing-methodology/`,
      `${MS}/bottom-up-market-sizing-methodology/`,
      `${MS}/hybrid-triangulation-and-sanity-check-techniques/`,
      `${CDD}/market-size-and-growth-assessment/`,
    ],
  },
  {
    id: "customer",
    title: "5. Customer and demand",
    guidance: [
      "Segment customers by need and economics; capture purchase drivers and the buying process per segment.",
      "Directional primary-research rules: 12-20 interviews per key cohort; 100-150 survey completes for roughly +-8-10pp at 95% - directional, not a power study.",
    ],
    sources: [`${CDD}/`, "https://umbrex.com/resources/competitive-intelligence-playbook/"],
    accessNotes:
      "CDD customer-behavior and CI Ch4 chapter texts were not retrievable on 2026-11-06; only public framework titles confirmed. Whether access is paywalled or the pages were failing is unverified - detail not claimed.",
  },
  {
    id: "competition",
    title: "6. Competition",
    guidance: [
      "Define competitors through five lenses: direct, substitutes, channel/platform power, upstream/downstream integrators, DIY/open source.",
      "Shortlist 6-12 by segment overlap, traction, response ability and intent; one competitor card each.",
      "Share: match numerator and denominator scope, use two numerator methods, trend 8-12 quarters with share-of-growth.",
      "Material claims need two sources; realized price over list price.",
    ],
    sources: [`${CDD}/competitive-landscape-and-positioning/`, "https://umbrex.com/resources/competitive-intelligence-playbook/"],
  },
  {
    id: "scenarios",
    title: "7. Growth drivers and scenarios",
    guidance: [
      "Decompose growth: category x share x realized price x mix, with model-specific mechanics.",
      "Write pessimistic/realistic/optimistic scenarios tied to observable triggers, plus early-warning signposts.",
    ],
    sources: [
      `${CDD}/market-size-and-growth-assessment/`,
      "https://umbrex.com/resources/scenario-planning-playbook/",
    ],
    accessNotes: "Scenario Planning public page offered an overview only on 2026-11-06; full chapter text not retrieved - access mechanism unverified.",
  },
  {
    id: "qa-gate",
    title: "8. QA gate",
    guidance: [
      "Every external figure traces to a source link with date and page; single-source numbers get a second method or are flagged.",
      "Totals reconcile; units and currency consistent; no hard-coded numbers inside formulas.",
      "Second-method check on killer variables; an independent review pass before delivery.",
    ],
    sources: [`${MS}/operationalizing-the-market-sizing-process/`, `${CDD}/data-collection-and-research-techniques/`],
  },
  {
    id: "deliver",
    title: "9. Deliver",
    guidance: [
      "Answer-first summary; ranges and confidence per segment; assumptions list; source register.",
      "Display uncertainty explicitly; every row justified; unverified items marked, never padded.",
    ],
    sources: [`${MS}/communicating-insights-and-driving-action/`, `${MS}/toolkits-templates-and-resources/`],
    accessNotes:
      "Market Sizing Ch11/Ch12 readable; Ch12 final 12.4 sentence cut off in public text - no continuation inferred.",
  },
] as const;

/** Illustrative worked examples from the playbooks whose numbers are NEVER data. */
export const ILLUSTRATIVE_EXAMPLE_BAN =
  "Worked examples in the Umbrex playbooks (EV battery, SaaS HR-tech, hydrogen electrolyzer) are illustrative; their figures must not appear as market data.";
