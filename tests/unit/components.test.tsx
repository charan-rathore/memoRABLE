// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlocksPanel } from "@/components/blocks/blocks-panel";
import { Inspector } from "@/components/blocks/inspector";
import { ImportPanel } from "@/components/import/import-panel";
import { importSource } from "@/import/import-source";
import { ATLAS_JSON_SOURCE } from "@/import/examples/catalog";
import type { MemoryDocument } from "@/domain/memory/schema";

function atlas(): MemoryDocument {
  const result = importSource({ raw: ATLAS_JSON_SOURCE, label: "atlas-q3-brief.json" });
  if (!result.ok) throw new Error("import failed");
  return result.value;
}

describe("BlocksPanel", () => {
  it("renders all six memories in order with edge moves disabled", () => {
    const doc = atlas();
    render(<BlocksPanel blocks={doc.blocks} selectedBlockId={null} onSelect={() => {}} onMove={() => {}} />);
    expect(screen.getAllByRole("button", { name: /show details/i })).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Move Snapshot up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Snapshot down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Actions down" })).toBeDisabled();
  });

  it("selecting a memory calls onSelect and reveals move controls", () => {
    const doc = atlas();
    const onSelect = vi.fn();
    render(<BlocksPanel blocks={doc.blocks} selectedBlockId={null} onSelect={onSelect} onMove={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Signals: show details" }));
    expect(onSelect).toHaveBeenCalledWith(doc.blocks[1]!.id);
  });

  it("move buttons call onMove with the right direction", () => {
    const doc = atlas();
    const onMove = vi.fn();
    render(<BlocksPanel blocks={doc.blocks} selectedBlockId={doc.blocks[1]!.id} onSelect={() => {}} onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Signals up" }));
    expect(onMove).toHaveBeenCalledWith(doc.blocks[1]!.id, -1);
  });

  it("replay reveal shows only the revealed memories", () => {
    const doc = atlas();
    render(
      <BlocksPanel blocks={doc.blocks} selectedBlockId={null} onSelect={() => {}} onMove={() => {}} revealCount={3} />,
    );
    expect(screen.getAllByRole("button", { name: /show details/i })).toHaveLength(3);
  });
});

describe("Inspector", () => {
  it("shows 'Remembered from' provenance with method, locator and excerpt", () => {
    const doc = atlas();
    const signals = doc.blocks[1]!;
    render(<Inspector block={signals} onViewSource={() => {}} />);
    expect(screen.getByText("Remembered from")).toBeInTheDocument();
    expect(screen.getByText("Exact JSON")).toBeInTheDocument();
    expect(screen.getByText(/blocks\[1\] · signals/)).toBeInTheDocument();
    expect(screen.getByText(/atlas-q3-brief\.json/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View source" })).toBeInTheDocument();
  });

  it("shows the empty state without a selection", () => {
    render(<Inspector block={null} onViewSource={() => {}} />);
    expect(screen.getByText(/Choose a memory/)).toBeInTheDocument();
  });
});

describe("ImportPanel", () => {
  const base = {
    sourceLabel: "atlas-q3-brief.json",
    sourceOk: true,
    sourceText: "{}",
    errors: [],
    warnings: [],
    hasVerified: false,
    aiEnabled: false,
    aiBusy: false,
    onEditSource: () => {},
    onImport: () => {},
    onUseExample: () => {},
    onUseVerified: () => {},
    onImproveWithAi: () => {},
  };

  it("shows friendly all-or-nothing errors with exact detail", () => {
    render(
      <ImportPanel
        {...base}
        sourceText='{"version": 1, broken'
        sourceOk={false}
        errors={[{ code: "json.syntax", message: "We couldn't understand this JSON. check the syntax here.", line: 1, column: 20 }]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t understand this JSON. Nothing was changed.");
    expect(screen.getByRole("alert")).toHaveTextContent("line 1, column 20");
  });

  it("keeps the samples behind a door once something is loaded, and warns that they replace it", () => {
    render(<ImportPanel {...base} />);

    // Replacing a remembered document is destructive, so it is never one stray
    // click away. and the samples used to sit inside the dropzone, where they
    // read as a description of what you could drop.
    expect(screen.queryByRole("button", { name: /Board brief/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Bring something else/ }));

    expect(screen.getByRole("button", { name: /Board brief/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch notes/ })).toBeInTheDocument();
    expect(screen.getByText(/replaces what is loaded now/)).toBeInTheDocument();
  });

  it("opens ready to receive when there is nothing to lose", () => {
    render(<ImportPanel {...base} sourceOk={false} sourceLabel="" />);
    expect(screen.getByRole("button", { name: /Board brief/ })).toBeInTheDocument();
    expect(screen.queryByText(/replaces what is loaded now/)).not.toBeInTheDocument();
  });

  it("never shows AI when disabled", () => {
    render(<ImportPanel {...base} />);
    expect(screen.queryByText(/Improve with AI/)).not.toBeInTheDocument();
  });

  it("shows warnings honestly", () => {
    render(<ImportPanel {...base} warnings={[{ code: "text.no-blocks-recognized", message: "No risks were recognized. that memory is empty." }]} />);
    expect(screen.getByText("No risks were recognized. that memory is empty.")).toBeInTheDocument();
  });
});
