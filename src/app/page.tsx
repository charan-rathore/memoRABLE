import { importSource } from "@/import/import-source";
import { renderBundle } from "@/render/render-bundle";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import { Workbench } from "@/components/workbench";

/**
 * The public entry: the preloaded Atlas workbench. The complete Document
 * output is rendered on the server and visible on first settled paint — no
 * upload, network request, AI key, onboarding or narration required.
 */
export default function Page() {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) {
    // The checked-in Atlas fixture is covered by tests; this can only fail if
    // the fixture and schema drifted apart, which must be loud, not silent.
    throw new Error(`Atlas fixture failed to import: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  const document = result.value;
  const bundle = renderBundle(document);

  return (
    <Workbench
      initial={{
        sourceText: ATLAS_JSON_SOURCE,
        sourceLabel: "atlas-q3-brief.json",
        document,
        outputs: bundle.outputs,
        at: "preloaded",
      }}
    />
  );
}
