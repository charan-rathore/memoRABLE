/**
 * Resume role-header recognition (archetype-gated).
 *
 * A columnar resume flattens role headers into one prose line:
 *   "Acme Analytics | Senior Product Analyst, Growth January 2024 – Present"
 *   "Team Lead, City Robotics Club March 2022 – August 2022"
 * The trailing range is a TENURE, not a delivery date, and the lead is a
 * role/org phrase, not a lesson. Left alone these lines are read as signals
 * or skipped by the schedule gates, so a resume loses its own work history.
 *
 * Callers must gate on the resume archetype: notes and plans contain similar
 * date ranges ("Pilot runs Jan–Jun 2026") and keep their existing reading.
 * Month atoms mirror import/text/patterns.ts (that module imports from
 * understanding, so it cannot be imported back - keep the atoms in step).
 */

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const YEAR = "(?:19|20)\\d{2}";

/** Tenure range: "January 2024 – Present", "March 2022 - August 2022". */
const TENURE = new RegExp(
  `(${MONTH}\\.?\\s+${YEAR})\\s*[-–—]\\s*(${MONTH}\\.?\\s+${YEAR}|present|current|now|ongoing)\\b`,
  "i",
);

/** Past-tense / impact verbs mark an achievement bullet, not a role header. */
const BULLET_VERB =
  /^(?:cut|reduce[sd]?|grew|grow|lifted|lift|improve[sd]?|ship(?:ped)?|launch(?:ed)?|built|build|led|lead(?:ing)?|won|win|awarded|increase[sd]?|decrease[sd]?|delivered|automated|designed|developed|managed|created|benchmarked|drove|raised|mentored|spearheaded|orchestrated|streamlined|achieved|boosted|coordinated|ran|run)\b/i;

export interface ResumeRoleHeader {
  /** Tenure start, verbatim (e.g. "January 2024"). */
  date: string;
  /** Tenure end, verbatim (e.g. "August 2022" or "Present"). */
  end: string;
  /** Role/org lead with the tenure stripped (e.g. "Team Lead, City Robotics Club"). */
  title: string;
  state: "done" | "on-track";
  /** Description flattened onto the line AFTER the tenure - kept verbatim. */
  trailing?: string;
}

export function parseResumeRoleHeader(raw: string): ResumeRoleHeader | null {
  const text = raw.trim();
  if (!text) return null;
  const tenure = TENURE.exec(text);
  // A line that LEADS with the tenure is a schedule line, not a role header.
  if (!tenure || tenure.index === 0) return null;
  const pre = text
    .slice(0, tenure.index)
    .replace(/[\s|·,;:–—-]+$/u, "")
    .trim();
  const words = pre.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 14) return null;
  // Sentence punctuation before the tenure means prose, not a header.
  if (/[.!?]$/.test(pre) || /^[-*•▪◦]/.test(pre)) return null;
  if (BULLET_VERB.test(pre)) return null;
  // A header names a role or org, so it leads with a capital or digit. A
  // lowercase lead ("of Mathematics, Some Institute …") is a sentence-split
  // fragment of a longer line, not a header of its own.
  if (!/^[\p{Lu}\p{N}]/u.test(pre)) return null;
  const start = tenure[1]!.replace(/\s+/g, " ").replace(/\.$/, "");
  const end = tenure[2]!.replace(/\s+/g, " ").replace(/\.$/, "");
  const ongoing = /^(present|current|now|ongoing)$/i.test(end);
  // The tenure rarely ends the flattened line: "… – Present Client analytics
  // and campaign decision support". That suffix is the role's own
  // description, not part of its title - keep it verbatim as trailing.
  const after = text
    .slice(tenure.index + tenure[0].length)
    .replace(/^[\s|·,;:–—-]+|[\s|·,;:–—-]+$/gu, "")
    .trim();
  return {
    date: start,
    end,
    title: pre,
    state: ongoing ? "on-track" : "done",
    ...(after.length > 0 ? { trailing: after } : {}),
  };
}
