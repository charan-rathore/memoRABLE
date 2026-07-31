/**
 * Yield to the browser so a progress UI can paint between import stages.
 * Import itself is synchronous; the stages are honest about the work units
 * (read → understand → remember → arrange), not fake byte counts.
 */
export function yieldFrame(ms = 48): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type ImportStage =
  | "reading"
  | "understanding"
  | "remembering"
  | "arranging"
  | "publishing";

export const IMPORT_STAGE_LABEL: Record<ImportStage, string> = {
  reading: "Reading the source",
  understanding: "Understanding what it is for",
  remembering: "Remembering the six memories",
  arranging: "Arranging what was remembered",
  publishing: "Opening the three outputs",
};

export const IMPORT_STAGE_PERCENT: Record<ImportStage, number> = {
  reading: 12,
  understanding: 38,
  remembering: 64,
  arranging: 86,
  publishing: 100,
};
