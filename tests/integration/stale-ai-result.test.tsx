// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importSource } from "@/import/import-source";
import { ATLAS_NOTES_SOURCE, ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import { Workbench } from "@/components/workbench";

vi.mock("@/render/render-bundle", () => ({ renderMode: () => ({ html: "<p>preview</p>", error: null }) }));
vi.mock("@/components/home/home-screen", () => ({ HomeScreen: ({ onImport }: { onImport: (text: string, label: string) => void }) => <button onClick={() => onImport(ATLAS_NOTES_SOURCE, "A.md")}>Import A</button> }));
vi.mock("@/components/import/import-stages", () => ({ IMPORT_STAGE_PERCENT: {}, IMPORT_STAGE_LABEL: {}, IMPORT_STAGE_VERB: {}, yieldFrame: async () => {} }));
vi.mock("@/components/ui/brand-splash", () => ({ BrandSplash: () => null }));
vi.mock("@/components/ui/demo-video", () => ({ DemoVideo: () => null }));
vi.mock("@/components/topbar", () => ({ Topbar: ({ documentTitle, onReplay, onRegenerate }: { documentTitle: string; onReplay: () => void; onRegenerate: () => void }) => <><h1>{documentTitle}</h1><button onClick={onReplay}>Replay</button><button onClick={onRegenerate}>Regenerate</button></> }));
vi.mock("@/components/import/import-panel", () => ({ ImportPanel: ({ onImproveWithAi, onImport, onEditSource, aiBusy }: { onImproveWithAi: () => void; onImport: (s: string, l: string) => void; onEditSource: (s: string) => void; aiBusy: boolean }) => <><button disabled={aiBusy} onClick={onImproveWithAi}>Improve</button><button onClick={() => onImport(ATLAS_JSON_SOURCE, "B.json")}>Import B</button><button onClick={() => onEditSource("edited")}>Edit source</button></> }));
vi.mock("@/components/preview/preview-pane", () => ({ PreviewPane: () => null }));
vi.mock("@/components/blocks/blocks-panel", () => ({ BlocksPanel: ({ blocks, onMove }: { blocks: {id:string;title:string}[]; onMove:(id:string,direction:-1|1)=>void }) => <div data-testid="block-order">{blocks.map(b=><button key={b.id} onClick={()=>onMove(b.id,1)}>{b.title}</button>)}</div> }));
vi.mock("@/components/blocks/inspector", () => ({ Inspector: () => null }));
vi.mock("@/components/journey-strip", () => ({ JourneyStrip: () => null }));
afterEach(() => vi.unstubAllGlobals());

async function start() {
  const doc = importSource({ raw: ATLAS_NOTES_SOURCE, label: "A.md" });
  if (!doc.ok) throw new Error("fixture failed");
  let resolve!: (r: Response) => void;
  const pending = new Promise<Response>((r) => { resolve = r; });
  const fetch = vi.fn().mockImplementation((_url, options) => options.method === "GET" ? Promise.resolve(Response.json({ enabled: true })) : pending);
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const view = render(<Workbench initial={{ sourceText: ATLAS_NOTES_SOURCE, sourceLabel: "A.md", document: doc.value, outputs: {} as never, at: "start" }} />);
  fireEvent.click(screen.getByText("Import A"));
  await screen.findByText("Improve");
  fireEvent.click(screen.getByText("Improve"));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/extract", expect.objectContaining({ method: "POST" })));
  const signal = fetch.mock.calls.find((c) => c[1]?.method === "POST")![1].signal as AbortSignal;
  return { resolve, signal, view };
}

describe("stale AI result ownership", () => {
  it("keeps B when an ignored-abort AI response for A arrives", async () => {
    const { resolve, signal } = await start();
    fireEvent.click(screen.getByText("Import B"));
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Q3 Board Report"));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(Response.json({ ok: true, improved: { ...JSON.parse(ATLAS_JSON_SOURCE), title: "Stale AI A" } })); });
    expect(screen.getByRole("heading")).toHaveTextContent("Q3 Board Report");
    expect(screen.queryByText("Stale AI A")).not.toBeInTheDocument();
  });
  it("cancels on source editing and never applies the old response", async () => {
    const { resolve, signal } = await start();
    fireEvent.click(screen.getByText("Edit source"));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(Response.json({ ok: true, improved: { ...JSON.parse(ATLAS_JSON_SOURCE), title: "Stale AI A" } })); });
    expect(screen.queryByText("Stale AI A")).not.toBeInTheDocument();
    expect(screen.getByText("Improve")).toBeEnabled();
  });
  it("cancels the browser request on unmount", async () => {
    const { view, signal, resolve } = await start();
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(Response.json({ ok: false })); });
  });
});
for (const elapsed of [0, 7100]) it(`new import owns state when replay has elapsed ${elapsed}ms`, async () => {
  const { resolve } = await start();
  await act(async () => resolve(Response.json({ ok: false })));
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByText("Replay"));
    await act(async () => vi.advanceTimersByTimeAsync(elapsed));
    fireEvent.click(screen.getByText("Import B"));
    await act(async () => vi.advanceTimersByTimeAsync(25000));
    expect(screen.getByRole("heading")).toHaveTextContent("Q3 Board Report");
  } finally { vi.useRealTimers(); }
});

for(const action of ["regenerate","move"]) it(`${action} after replay tick does not operate on demo state`,async()=>{
 const {resolve}=await start(); await act(async()=>resolve(Response.json({ok:false})));
 const title=screen.getByRole("heading").textContent;
 const order=screen.getByTestId("block-order").textContent;
 vi.useFakeTimers();
 try {
  fireEvent.click(screen.getByText("Replay")); await act(async()=>vi.advanceTimersByTimeAsync(7100));
  if(action==="regenerate") fireEvent.click(screen.getByText("Regenerate"));
  else fireEvent.click(screen.getByTestId("block-order").querySelector('button')!);
  await act(async()=>vi.advanceTimersByTimeAsync(25000));
  expect(screen.getByRole("heading").textContent).toBe(title);
  if(action==="move") {
   expect(screen.getByTestId("block-order").textContent).toBe(order);
   expect(screen.queryByText(/moved down/)).not.toBeInTheDocument();
  }
 }finally{vi.useRealTimers()}
});
it("normal move outside replay still reorders the user's document",async()=>{
 const {resolve}=await start();await act(async()=>resolve(Response.json({ok:false})));
 const before=Array.from(screen.getByTestId("block-order").querySelectorAll("button")).map(b=>b.textContent);
 fireEvent.click(screen.getByTestId("block-order").querySelector("button")!);
 const after=Array.from(screen.getByTestId("block-order").querySelectorAll("button")).map(b=>b.textContent);
 expect(after).toEqual([before[1],before[0],...before.slice(2)]);
});
