import { err, ok, type Result } from "@/reliability/result";
import { diagnostic } from "@/reliability/diagnostics";

/**
 * Compatibility validation for `renderToJson` output. The Unlayer design
 * JSON download is only offered when this passes; an incompatible structure
 * disables just that download (reliability layer 6).
 */

const KNOWN_CONTENT_TYPES = new Set([
  "heading",
  "text",
  "button",
  "divider",
  "image",
  "html",
  "menu",
  "social",
  "table",
  "video",
]);

export interface DesignJsonSummary {
  rowCount: number;
  columnCount: number;
  contentCount: number;
  contentTypes: string[];
  schemaVersion: number;
}

export function validateDesignJson(value: unknown): Result<DesignJsonSummary> {
  if (typeof value !== "object" || value === null) {
    return err([diagnostic("render.json-incompatible", "The design JSON is not an object.")]);
  }
  const design = value as Record<string, unknown>;
  if (typeof design.schemaVersion !== "number") {
    return err([diagnostic("render.json-incompatible", "The design JSON has no numeric schemaVersion.")]);
  }
  const body = design.body as Record<string, unknown> | undefined;
  if (!body || !Array.isArray(body.rows)) {
    return err([diagnostic("render.json-incompatible", "The design JSON has no body.rows array.")]);
  }

  let columnCount = 0;
  let contentCount = 0;
  const contentTypes = new Set<string>();

  for (let r = 0; r < body.rows.length; r++) {
    const row = body.rows[r] as Record<string, unknown> | undefined;
    if (!row || !Array.isArray(row.columns)) {
      return err([
        diagnostic("render.json-incompatible", `Row ${r + 1} has no columns array.`, { path: `body.rows[${r}]` }),
      ]);
    }
    columnCount += row.columns.length;
    for (let c = 0; c < row.columns.length; c++) {
      const column = row.columns[c] as Record<string, unknown> | undefined;
      if (!column || !Array.isArray(column.contents)) {
        return err([
          diagnostic("render.json-incompatible", `Column ${c + 1} of row ${r + 1} has no contents array.`, {
            path: `body.rows[${r}].columns[${c}]`,
          }),
        ]);
      }
      for (let k = 0; k < column.contents.length; k++) {
        const content = column.contents[k] as Record<string, unknown> | undefined;
        const type = content?.type;
        if (typeof type !== "string" || !KNOWN_CONTENT_TYPES.has(type)) {
          return err([
            diagnostic(
              "render.json-incompatible",
              `Unrecognized content type ${JSON.stringify(type)} in row ${r + 1}.`,
              { path: `body.rows[${r}].columns[${c}].contents[${k}]` },
            ),
          ]);
        }
        contentTypes.add(type);
        contentCount += 1;
      }
    }
  }

  return ok({
    rowCount: body.rows.length,
    columnCount,
    contentCount,
    contentTypes: [...contentTypes].sort(),
    schemaVersion: design.schemaVersion,
  });
}
