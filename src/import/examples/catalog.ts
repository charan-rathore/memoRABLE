import type { MemoryDocument, MemorySource } from "@/domain/memory/schema";
import { importJson, sourceFingerprint } from "../json/import-json";

/**
 * Checked-in examples. The Atlas brief is the preloaded judge experience; the
 * Atlas notes power the local text path and the curated verified-example
 * extraction (which is ONLY ever offered for this exact, fingerprint-matched
 * content — arbitrary text never receives fixture content).
 */

export interface ExampleEntry {
  id: "atlas-json" | "atlas-notes";
  /** Human label shown in provenance. */
  label: string;
  format: "json" | "markdown";
  description: string;
  /** Full source text, embedded so the app works with zero network access. */
  source: string;
}

export const ATLAS_JSON_SOURCE = `{
  "version": 1,
  "title": "Q3 Board Report",
  "blocks": [
    {
      "kind": "snapshot",
      "payload": {
        "heading": "Momentum, with room to compound.",
        "hook": "If you remember one thing: growth is no longer the constraint. Supply is.",
        "summary": "Atlas spent Q3 proving that fleet analytics sells itself, and Q4 proving it can be delivered. Revenue, retention and runway all moved the right way at once, which is rare enough to be worth naming. The pressure has moved downstream: actuator lead times and senior robotics hiring now decide how much of that demand actually converts.",
        "byline": "Prepared by A. Rathore · Reviewed by Finance · July 2026"
      }
    },
    {
      "kind": "signals",
      "title": "Signals",
      "payload": {
        "entries": [
          { "label": "ARR", "value": "$4.2M", "delta": "+18%", "trend": "up", "implication": "Fleet analytics carried the quarter, so the EU launch is worth funding ahead of schedule" },
          { "label": "Net retention", "value": "121%", "delta": "+6 pts", "trend": "up", "implication": "Existing customers expand faster than new ones arrive, which favours depth over reach" },
          { "label": "Runway", "value": "19 mo", "delta": "+2 mo", "trend": "up", "implication": "There is room to hire ahead of revenue rather than behind it" },
          { "label": "Headcount", "value": "34", "delta": "+5", "trend": "up", "implication": "Hiring is keeping pace everywhere except senior robotics" }
        ]
      }
    },
    {
      "kind": "timeline",
      "title": "Timeline",
      "payload": {
        "entries": [
          { "date": "Jul", "title": "Fleet Analytics general availability", "state": "shipped", "produces": "A shipped analytics tier" },
          { "date": "Aug", "title": "Enterprise pilots converted, Meridian Ports and Helvetia Rail", "state": "shipped", "produces": "Two annual contracts", "requires": "A shipped analytics tier" },
          { "date": "Sep", "title": "Series B data room complete", "state": "on-track", "produces": "A complete data room", "requires": "Two annual contracts" },
          { "date": "Oct", "title": "EU market entry, DACH first", "state": "planned", "requires": "A complete data room" }
        ]
      }
    },
    {
      "kind": "risks",
      "title": "Risks",
      "payload": {
        "entries": [
          { "risk": "Actuator lead times are stretching", "severity": "high", "because": "A single supplier now sets the delivery date for every unit", "consequence": "Signed EU contracts slip a quarter and the launch window closes", "mitigation": "Dual-sourcing complete by Oct" },
          { "risk": "Senior robotics hiring is not keeping pace", "severity": "medium", "because": "Five hires landed but none in the roles that unblock the roadmap", "consequence": "The Q4 roadmap ships late even with the budget approved", "mitigation": "Retainers with two search firms" },
          { "risk": "GPU cloud spend is growing faster than revenue", "severity": "medium", "because": "Inference load scales with fleet size rather than with contract value", "consequence": "Gross margin erodes exactly as volume arrives", "mitigation": "Committed-use discount, 22% off list" }
        ]
      }
    },
    {
      "kind": "decisions",
      "title": "Decisions",
      "payload": {
        "entries": [
          { "ref": "D-021", "text": "Expand the fleet-analytics pricing tier ahead of the EU launch", "status": "approved", "commitment": "committed", "because": "Retention says existing customers will pay for depth" },
          { "ref": "D-022", "text": "Dual-source actuator supply by October", "status": "approved", "commitment": "committed", "because": "One supplier cannot be allowed to set the launch date" },
          { "ref": "D-023", "text": "Approve the Q4 hiring plan, six roles including two senior robotics engineers", "status": "requested", "commitment": "considered" }
        ]
      }
    },
    {
      "kind": "actions",
      "title": "Actions",
      "payload": {
        "entries": [
          { "task": "Sign the dual-sourcing contract", "owner": "M. Chen", "due": "Aug 15", "status": "ready", "from": "D-022" },
          { "task": "EU pricing proposal to the board", "owner": "A. Rathore", "due": "Sep 2", "status": "pending", "from": "D-021" },
          { "task": "Series B data room v1 to counsel", "owner": "J. Okafor", "due": "Sep 12", "status": "pending" }
        ]
      }
    }
  ]
}
`;

export const ATLAS_NOTES_SOURCE = `# Atlas Launch Notes

Atlas closed Q3 at $4.2M ARR, up 18% quarter-over-quarter on the fleet-analytics launch. Net revenue retention reached 121%, and two enterprise pilots converted to annual contracts. We enter Q4 with 19 months of runway and a focused hiring plan.

Prepared by A. Rathore · Reviewed by Finance · July 2026

## Signals

- ARR: $4.2M (+18%)
- Net retention: 121% (+6 pts)
- Runway: 19 mo (+2 mo)
- Headcount: 34 (+5)

## Timeline

- Jul: Fleet Analytics general availability - shipped
- Aug: Enterprise pilots converted (Meridian Ports, Helvetia Rail) - shipped
- Sep: Series B data room complete - on track
- Oct: EU market entry, DACH first - planned

## Risks

- Supply-chain lead times on actuators (high) - mitigation: dual-sourcing complete by Oct
- Senior robotics hiring velocity (medium) - mitigation: retainers with two search firms
- GPU cloud spend growth (medium) - mitigation: committed-use discount, 22% off list

## Decisions

- D-021 Expand the fleet-analytics pricing tier ahead of the EU launch - approved
- D-022 Dual-source actuator supply by October - approved
- D-023 Approve the Q4 hiring plan, six roles including two senior robotics engineers - requested

## Actions

- [ ] Sign the dual-sourcing contract - M. Chen - Aug 15
- [ ] EU pricing proposal to the board - A. Rathore - Sep 2
- [ ] Series B data room v1 to counsel - J. Okafor - Sep 12
`;

/**
 * Curated verified extraction for the Atlas notes. Kept in lockstep with
 * ATLAS_NOTES_SOURCE by tests; used only when the source fingerprint matches
 * exactly.
 */
export const ATLAS_NOTES_VERIFIED: MemorySource = {
  version: 1,
  title: "Atlas Launch Notes",
  blocks: [
    {
      kind: "snapshot",
      payload: {
        heading: "Atlas Launch Notes",
        hook: "If you remember one thing: growth is no longer the constraint. Supply is.",
        summary:
          "These notes record the quarter fleet analytics stopped being a bet. Revenue, retention and runway moved together, which is rare enough to be worth naming, and the pressure moved downstream with them. What decides Q4 now is whether actuators arrive and whether two senior robotics roles get filled.",
        byline: "Prepared by A. Rathore · Reviewed by Finance · July 2026",
      },
    },
    {
      kind: "signals",
      payload: {
        entries: [
          { label: "ARR", value: "$4.2M", delta: "+18%", trend: "up", implication: "Fleet analytics carried the quarter" },
          { label: "Net retention", value: "121%", delta: "+6 pts", trend: "up", implication: "Existing customers expand faster than new ones arrive" },
          { label: "Runway", value: "19 mo", delta: "+2 mo", trend: "up", implication: "There is room to hire ahead of revenue" },
          { label: "Headcount", value: "34", delta: "+5", trend: "up", implication: "Hiring keeps pace everywhere except senior robotics" },
        ],
      },
    },
    {
      kind: "timeline",
      payload: {
        entries: [
          { date: "Jul", title: "Fleet Analytics general availability", state: "shipped", produces: "A shipped analytics tier" },
          { date: "Aug", title: "Enterprise pilots converted (Meridian Ports, Helvetia Rail)", state: "shipped", produces: "Two annual contracts", requires: "A shipped analytics tier" },
          { date: "Sep", title: "Series B data room complete", state: "on-track", produces: "A complete data room", requires: "Two annual contracts" },
          { date: "Oct", title: "EU market entry, DACH first", state: "planned", requires: "A complete data room" },
        ],
      },
    },
    {
      kind: "risks",
      payload: {
        entries: [
          {
            risk: "Supply-chain lead times on actuators",
            severity: "high",
            because: "A single supplier sets the delivery date for every unit",
            consequence: "Signed EU contracts slip a quarter",
            mitigation: "dual-sourcing complete by Oct",
          },
          {
            risk: "Senior robotics hiring velocity",
            severity: "medium",
            because: "Five hires landed but none in the roles that unblock the roadmap",
            consequence: "The Q4 roadmap ships late even with budget approved",
            mitigation: "retainers with two search firms",
          },
          {
            risk: "GPU cloud spend growth",
            severity: "medium",
            because: "Inference load scales with fleet size, not contract value",
            consequence: "Gross margin erodes as volume arrives",
            mitigation: "committed-use discount, 22% off list",
          },
        ],
      },
    },
    {
      kind: "decisions",
      payload: {
        entries: [
          {
            ref: "D-021",
            text: "Expand the fleet-analytics pricing tier ahead of the EU launch",
            status: "approved",
            commitment: "committed",
            because: "Retention says existing customers will pay for depth",
          },
          {
            ref: "D-022",
            text: "Dual-source actuator supply by October",
            status: "approved",
            commitment: "committed",
            because: "One supplier cannot set the launch date",
          },
          {
            ref: "D-023",
            text: "Approve the Q4 hiring plan, six roles including two senior robotics engineers",
            status: "requested",
            commitment: "considered",
          },
        ],
      },
    },
    {
      kind: "actions",
      payload: {
        entries: [
          { task: "Sign the dual-sourcing contract", owner: "M. Chen", due: "Aug 15", status: "ready", from: "D-022" },
          { task: "EU pricing proposal to the board", owner: "A. Rathore", due: "Sep 2", status: "pending", from: "D-021" },
          { task: "Series B data room v1 to counsel", owner: "J. Okafor", due: "Sep 12", status: "pending" },
        ],
      },
    },
  ],
};

export const EXAMPLES: readonly ExampleEntry[] = [
  {
    id: "atlas-json",
    label: "atlas-q3-brief.json",
    format: "json",
    description: "Board brief · JSON",
    source: ATLAS_JSON_SOURCE,
  },
  {
    id: "atlas-notes",
    label: "atlas-launch-notes.md",
    format: "markdown",
    description: "Launch notes · Markdown",
    source: ATLAS_NOTES_SOURCE,
  },
];

export function getExample(id: ExampleEntry["id"]): ExampleEntry {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`unknown example: ${id}`);
  return found;
}

/** Fingerprint of the curated notes, computed once from the embedded source. */
const ATLAS_NOTES_FINGERPRINT = sourceFingerprint(ATLAS_NOTES_SOURCE);

/**
 * The curated verified-example extraction. Returns a canonical document ONLY
 * when the provided text is byte-identical (modulo line endings) to the
 * checked-in Atlas notes — arbitrary text never receives fixture content.
 */
export function verifiedExtractionFor(text: string, label: string): MemoryDocument | null {
  if (sourceFingerprint(text) !== ATLAS_NOTES_FINGERPRINT) return null;
  const result = importJson({ text: JSON.stringify(ATLAS_NOTES_VERIFIED), label });
  if (!result.ok) return null;
  const doc = result.value;
  return {
    ...doc,
    sourceMethod: "verified-example",
    blocks: doc.blocks.map((b) => ({
      ...b,
      provenance: { ...b.provenance, method: "verified-example" as const },
    })),
  };
}

/** True when the text exactly matches the curated Atlas notes. */
export function hasVerifiedExtraction(text: string): boolean {
  return sourceFingerprint(text) === ATLAS_NOTES_FINGERPRINT;
}
