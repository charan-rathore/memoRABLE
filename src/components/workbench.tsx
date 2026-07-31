"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { MemoryBlock, MemoryDocument } from "@/domain/memory/schema";
import { OUTPUT_MODES, type OutputMode } from "@/domain/memory/types";
import { importSource } from "@/import/import-source";
import { importJson } from "@/import/json/import-json";
import { getExample, hasVerifiedExtraction, verifiedExtractionFor } from "@/import/examples/catalog";
import { renderMode, type ModeOutput } from "@/render/render-bundle";
import { displayHtml, initialWorkbenchState, type RenderCacheEntry, type WorkbenchAction, workbenchReducer } from "./workbench-state";
import { Topbar } from "./topbar";
import { JourneyStrip } from "./journey-strip";
import { ImportPanel } from "./import/import-panel";
import { BlocksPanel } from "./blocks/blocks-panel";
import { Inspector } from "./blocks/inspector";
import { PreviewPane } from "./preview/preview-pane";
import { SourceModal } from "./preview/source-modal";
import { PublishPanel } from "./export/publish-panel";
import { StageAnnouncer } from "./ui/stage-announcer";
import { BrandSplash } from "./ui/brand-splash";
import { DemoVideo } from "./ui/demo-video";
import { recordDocument, recordPublished } from "@/stats/local-stats";
import { rememberLibraryDoc } from "@/stats/doc-library";
import type { PublishThemeId } from "@/render/themes";
import { HomeScreen } from "./home/home-screen";
import { useReplay } from "./replay/use-replay";
import {
  IMPORT_STAGE_LABEL,
  IMPORT_STAGE_PERCENT,
  IMPORT_STAGE_VERB,
  type ImportStage,
  yieldFrame,
} from "./import/import-stages";
import { highlightRange } from "./preview/source-modal";

export interface WorkbenchInitial {
  sourceText: string;
  sourceLabel: string;
  document: MemoryDocument;
  outputs: Record<OutputMode, ModeOutput>;
  at: string;
}

type MobileTab = "bring" | "memories" | "publish";

export function Workbench({ initial }: { initial: WorkbenchInitial }) {
  const [state, dispatch] = useReducer(
    workbenchReducer,
    initial,
    (init) => initialWorkbenchState({ ...init, at: init.at }),
  );
  const [announcement, setAnnouncement] = useState("");
  const [sourceModal, setSourceModal] = useState<MemoryBlock | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("publish");
  const [reducedMotion, setReducedMotion] = useState(false);
  /** The workbench is withheld until the visitor has brought something to it. */
  const [view, setView] = useState<"home" | "workbench">("home");
  /** Splash plays on every arrival at home. reload included. */
  const [splash, setSplash] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<{ stage: ImportStage; percent: number } | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [bringForceOpen, setBringForceOpen] = useState(0);
  const memoriesRef = useRef<HTMLDivElement>(null);
  const bringRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<PublishThemeId>("editorial");
  themeRef.current = state?.theme ?? "editorial";

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    fetch("/api/extract", { method: "GET" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((body: { enabled?: boolean }) => setAiEnabled(body.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    // Re-set on the next tick so identical messages are re-announced.
    setTimeout(() => setAnnouncement(message), 30);
  }, []);

  /* ------------------------------- import flow ------------------------------- */

  const runImport = useCallback(
    async (text: string, label: string) => {
      const mark = async (stage: ImportStage) => {
        setImportProgress({ stage, percent: IMPORT_STAGE_PERCENT[stage] });
        announce(IMPORT_STAGE_LABEL[stage]);
        await yieldFrame(stage === "publishing" ? 160 : 56);
      };

      await mark("reading");
      await mark("understanding");
      await mark("remembering");
      const result = importSource({ raw: text, label });
      if (result.ok) {
        await mark("arranging");
        dispatch({ type: "imported", sourceText: text, sourceLabel: label, document: result.value, at: nowLabel() });
        recordDocument(result.value.blocks.length);
        rememberLibraryDoc({ title: result.value.title, label, sourceText: text });
        setView("workbench");
        setMobileTab("publish");
        await mark("publishing");
        scheduleLazyRenders(result.value, [], "document", themeRef.current, dispatch);
        announce(`Understood: 6 memories created from ${label}.`);
      } else {
        dispatch({ type: "importFailed", sourceText: text, sourceLabel: label, errors: [...result.errors] });
        announce(
          `We couldn't understand this. Nothing was changed. ${result.errors.length} ${result.errors.length === 1 ? "error" : "errors"}.`,
        );
      }
      setImportProgress(null);
    },
    [announce],
  );

  const loadExample = useCallback(
    (id: "atlas-json" | "atlas-notes") => {
      const example = getExample(id);
      runImport(example.source, example.label);
    },
    [runImport],
  );

  const applyVerified = useCallback(() => {
    const doc = verifiedExtractionFor(state.sourceText, state.sourceLabel);
    if (doc) {
      dispatch({ type: "imported", sourceText: state.sourceText, sourceLabel: state.sourceLabel, document: doc, at: nowLabel() });
      announce("Verified example extraction applied. 6 memories.");
    }
  }, [state.sourceText, state.sourceLabel, announce]);

  const improveWithAi = useCallback(async () => {
    if (!state.document || aiBusy) return;
    setAiBusy(true);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceText: state.sourceText.slice(0, 51_200),
          candidate: {
            version: 1,
            title: state.document.title,
            blocks: state.document.blocks.map((b) => ({ kind: b.kind, title: b.title, payload: b.payload })),
          },
        }),
      });
      const body = (await response.json()) as { ok?: boolean; improved?: unknown; message?: string };
      if (response.ok && body.ok && body.improved) {
        const improved = importJson({ text: JSON.stringify(body.improved), label: state.sourceLabel });
        if (improved.ok) {
          const doc: MemoryDocument = {
            ...improved.value,
            sourceMethod: "ai",
            blocks: improved.value.blocks.map((block) => {
              const previous = state.document!.blocks.find((b) => b.kind === block.kind);
              return {
                ...block,
                provenance: {
                  ...block.provenance,
                  method: "ai" as const,
                  locator: previous?.provenance.locator ?? block.provenance.locator,
                  excerpt: previous?.provenance.excerpt ?? block.provenance.excerpt,
                },
              };
            }),
          };
          dispatch({ type: "imported", sourceText: state.sourceText, sourceLabel: state.sourceLabel, document: doc, at: nowLabel() });
          announce("AI improved the local result. 6 memories, same sources.");
        } else {
          announce("AI output didn't match the memory shape. the local result is unchanged.");
        }
      } else {
        announce(body.message ?? "AI is unavailable. the local result is unchanged.");
      }
    } catch {
      announce("AI could not be reached. the local result is unchanged.");
    } finally {
      setAiBusy(false);
    }
  }, [state.document, state.sourceText, state.sourceLabel, aiBusy, announce]);

  /* ------------------------------ arrange/publish ----------------------------- */

  const moveBlock = useCallback(
    (blockId: string, direction: -1 | 1) => {
      const block = state.document?.blocks.find((b) => b.id === blockId);
      dispatch({ type: "reordered", blockId, direction });
      if (block) announce(`${block.title} moved ${direction === -1 ? "up" : "down"}.`);
      // Reorder renders only the active mode synchronously (~60-100ms) . 
      // fast enough that lazy deferral isn't needed and would risk stale state.
    },
    [state.document, announce],
  );

  const setMode = useCallback(
    (mode: OutputMode) => {
      dispatch({ type: "modeChanged", mode });
    },
    [],
  );

  /* --------------------------------- replay ---------------------------------- */

  const snapshotRef = useRef<{
    sourceText: string;
    sourceLabel: string;
    document: MemoryDocument | null;
    outputs: Partial<Record<OutputMode, ModeOutput>>;
    lastGood: Partial<Record<OutputMode, ModeOutput>>;
    mode: OutputMode;
  } | null>(null);

  const replayCallbacks = useMemo(
    () => ({
      runRealImport: () => {
        const example = getExample("atlas-json");
        const result = importSource({ raw: example.source, label: example.label });
        if (result.ok) {
          dispatch({ type: "imported", sourceText: example.source, sourceLabel: example.label, document: result.value, at: nowLabel() });
        }
      },
      setMode: (mode: OutputMode) => dispatch({ type: "modeChanged", mode }),
      snapshot: () => {
        snapshotRef.current = {
          sourceText: state.sourceText,
          sourceLabel: state.sourceLabel,
          document: state.document,
          outputs: state.outputs,
          lastGood: state.lastGood,
          mode: state.mode,
        };
      },
      restore: () => {
        if (snapshotRef.current) {
          dispatch({ type: "restored", snapshot: snapshotRef.current });
          snapshotRef.current = null;
        }
      },
      announce,
    }),
    [state.sourceText, state.sourceLabel, state.document, state.outputs, state.lastGood, state.mode, announce],
  );

  const replay = useReplay(replayCallbacks, reducedMotion);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && replay.active) replay.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  /* --------------------------------- derived --------------------------------- */

  const selectedBlock = state.document?.blocks.find((b) => b.id === state.selectedBlockId) ?? null;
  const { html, stale, error } = displayHtml(state, state.mode);
  const hasVerified = hasVerifiedExtraction(state.sourceText) && state.document?.sourceMethod !== "verified-example";

  const publish = useCallback(() => {
    dispatch({ type: "published", at: nowLabel() });
    recordPublished();
    setPublishOpen(true);
    announce("Published: one memory, three useful outputs.");
  }, [announce]);

  const jumpJourney = useCallback(
    (key: string) => {
      if (key === "bring") {
        setMobileTab("bring");
        setBringForceOpen((n) => n + 1);
        requestAnimationFrame(() => bringRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
        announce("Bring: paste, drop a file, or reopen a recent document.");
        return;
      }
      if (key === "understand") {
        setMobileTab("memories");
        const first = state.document?.blocks[0];
        if (first) dispatch({ type: "blockSelected", blockId: first.id });
        requestAnimationFrame(() => memoriesRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        announce("Understand: six memory types recognized from the source.");
        return;
      }
      if (key === "remember") {
        setMobileTab("memories");
        const first = state.document?.blocks[0];
        if (first) {
          dispatch({ type: "blockSelected", blockId: first.id });
          setSourceModal(first);
        }
        requestAnimationFrame(() => memoriesRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        announce("Remember: open a memory to see exactly where it came from.");
        return;
      }
      if (key === "arrange") {
        setMobileTab("memories");
        const first = state.document?.blocks[0];
        if (first) dispatch({ type: "blockSelected", blockId: first.id });
        requestAnimationFrame(() => memoriesRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
        announce("Arrange: use ↑ ↓ on a selected memory to reorder publication.");
        return;
      }
      if (key === "publish") {
        setMobileTab("publish");
        if (state.document) publish();
        else announce("Bring a document before you publish.");
      }
    },
    [announce, publish, state.document],
  );

  const goHome = useCallback(() => {
    if (replay.active) replay.cancel();
    setPublishOpen(false);
    setSourceModal(null);
    setDemoOpen(false);
    setSplash(true);
    setView("home");
    announce("Back to the start. Your memories are kept.");
  }, [replay, announce]);

  const finishSplash = useCallback(() => {
    setSplash(false);
    // First visit in this browser: offer the short demo after the brand moment.
    try {
      if (window.sessionStorage.getItem("memorable.demo.seen") !== "1") {
        window.sessionStorage.setItem("memorable.demo.seen", "1");
        setDemoOpen(true);
      }
    } catch {
      setDemoOpen(true);
    }
  }, []);

  if (view === "home") {
    return (
      <>
        {splash && <BrandSplash onFinished={finishSplash} />}
        <div className={splash ? "app-behind" : undefined}>
          <HomeScreen
            errors={[...state.errors]}
            onImport={runImport}
            onUseExample={loadExample}
            onReplayBrand={() => setSplash(true)}
            understanding={importProgress}
          />
        </div>
        {demoOpen && !splash && <DemoVideo onClose={() => setDemoOpen(false)} />}
        <StageAnnouncer message={announcement} />
      </>
    );
  }

  return (
    <div className="replay-wrap">
      <Topbar
        onHome={goHome}
        documentTitle={state.document?.title ?? "Untitled document"}
        blockCount={state.document?.blocks.length ?? 0}
        mode={state.mode}
        onModeChange={(mode) => {
          setMode(mode);
          announce(
            `Composed using Elements · ${mode === "web" ? "Web page" : mode === "email" ? "Email" : "Document"}.`,
          );
        }}
        theme={state.theme}
        onThemeChange={(theme) => {
          dispatch({ type: "themeChanged", theme });
          announce(`Theme: ${theme}. Outputs recomposed with Elements.`);
          if (state.document) scheduleLazyRenders(state.document, [], state.mode, theme, dispatch);
        }}
        onOpenRecent={(text, label) => void runImport(text, label)}
        aiEnabled={aiEnabled}
        replayActive={replay.active}
        onReplay={() => (replay.active ? replay.cancel() : replay.start())}
        onPublish={publish}
        canPublish={state.document !== null}
      />
      <JourneyStrip
        state={state}
        replayStep={replay.view?.journeyStep ?? null}
        onStep={jumpJourney}
      />
      {(replay.view || importProgress) && (
        <div className="replay-banner" role="status" data-testid="import-progress">
          <span className="rb-step">
            {importProgress ? IMPORT_STAGE_VERB[importProgress.stage] : "Replay"}
          </span>
          <span className="rb-msg">
            {importProgress ? IMPORT_STAGE_LABEL[importProgress.stage] : replay.view?.message}
          </span>
          {replay.view ? (
            <button type="button" onClick={replay.cancel}>
              Stop
            </button>
          ) : null}
          <span
            className="prog"
            style={{
              width: `${Math.round((importProgress?.percent ?? (replay.view?.progress ?? 0) * 100))}%`,
            }}
          />
        </div>
      )}

      <main className="shell">
        <div className="rail-l">
          <div ref={bringRef} className={mobileTab === "bring" ? "" : "mobile-hide"}>
            <ImportPanel
              sourceLabel={state.sourceLabel}
              sourceOk={state.document !== null && state.errors.length === 0}
              sourceText={state.sourceText}
              errors={[...state.errors]}
              warnings={state.document?.warnings ?? []}
              hasVerified={hasVerified}
              aiEnabled={aiEnabled && state.document?.sourceMethod === "local-parser"}
              aiBusy={aiBusy}
              forceBringOpen={bringForceOpen}
              onEditSource={(text) => dispatch({ type: "sourceEdited", sourceText: text })}
              onImport={runImport}
              onUseExample={loadExample}
              onUseVerified={applyVerified}
              onImproveWithAi={() => void improveWithAi()}
            />
          </div>
          <div ref={memoriesRef} className={`mem-rail${mobileTab === "memories" ? "" : " mobile-hide"}`}>
            <BlocksPanel
              blocks={state.document?.blocks ?? []}
              selectedBlockId={state.selectedBlockId}
              onSelect={(id) => {
                dispatch({ type: "blockSelected", blockId: id });
                if (id && state.document) {
                  const block = state.document.blocks.find((b) => b.id === id) ?? null;
                  if (block) setSourceModal(block);
                } else {
                  setSourceModal(null);
                }
              }}
              onHover={setHoveredBlockId}
              onMove={moveBlock}
              revealCount={replay.view?.revealCount ?? null}
              enterKey={state.importedAt}
            />
          </div>
        </div>

        {/* The canvas scrolls on its own, so it needs to be reachable by
            keyboard: its only child is a sandboxed iframe, which can never
            take focus on the parent's behalf. */}
        <div
          className={`canvas${mobileTab !== "publish" ? " mobile-hide" : ""}`}
          tabIndex={0}
          role="region"
          aria-label="Output preview"
        >
          {html || !error ? (
            <PreviewPane
              mode={state.mode}
              html={html}
              stale={stale}
              error={error}
              documentTitle={state.document?.title ?? "untitled"}
              blockCount={state.document?.blocks.length ?? 0}
              theme={state.theme}
            />
          ) : (
            <div className="empty-canvas">
              <p className="ec-num">01. 06</p>
              <h2>Nothing here yet</h2>
              <p>
                Bring your information and all six memories arrive together, in reading order: snapshot,
                signals, decisions, timeline, risks, actions. Nothing is placed by hand.
              </p>
              <button type="button" className="btn pri" onClick={() => loadExample("atlas-json")}>
                Use the Atlas example
              </button>
            </div>
          )}
        </div>

        <div className={`rail-r${selectedBlock && mobileTab === "memories" ? " open" : ""}`}>
          <Inspector
            block={selectedBlock}
            document={state.document}
            onViewSource={(block) => setSourceModal(block)}
            onSelectRelated={(blockId) => dispatch({ type: "blockSelected", blockId })}
          />
        </div>
      </main>

      <nav className="mobile-tabs" aria-label="Workbench sections">
        {(
          [
            ["bring", "Bring"],
            ["memories", "Memories"],
            ["publish", "Publish"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={mobileTab === tab ? "on" : undefined}
            aria-pressed={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {sourceModal && (
        <SourceModal
          block={sourceModal}
          sourceText={state.sourceText}
          softLines={
            hoveredBlockId && hoveredBlockId !== sourceModal.id
              ? (() => {
                  const hovered = state.document?.blocks.find((b) => b.id === hoveredBlockId);
                  return hovered ? highlightRange(state.sourceText, hovered) : null;
                })()
              : null
          }
          onClose={() => setSourceModal(null)}
        />
      )}
      {publishOpen && (
        <PublishPanel
          state={state}
          onClose={() => {
            setPublishOpen(false);
            dispatch({ type: "publishClosed" });
          }}
          onDownloaded={(message) => announce(message)}
        />
      )}
      <StageAnnouncer message={announcement} />
    </div>
  );
}

function nowLabel(): string {
  return new Date().toISOString();
}

/** Render the remaining (non-active) modes on the next idle tick so the UI
 *  stays responsive during imports and reorders. */
function scheduleLazyRenders(
  doc: MemoryDocument,
  _cache: RenderCacheEntry[],
  activeMode: OutputMode,
  theme: PublishThemeId,
  dispatch: React.Dispatch<WorkbenchAction>,
) {
  if (!doc) return;
  const remaining = OUTPUT_MODES.filter((m) => m !== activeMode);
  if (remaining.length === 0) return;
  setTimeout(() => {
    const filled: Partial<Record<OutputMode, ModeOutput>> = {};
    for (const m of remaining) {
      const output = renderMode(doc, m, theme);
      filled[m] = output;
    }
    dispatch({ type: "lazyRendered", outputs: filled, cache: [] });
  }, 0);
}

// (WorkbenchAction imported above with workbench-state imports)
