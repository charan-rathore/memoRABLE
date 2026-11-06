// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { LiveGuidancePanel } from "../../src/components/preview/live-guidance-panel";

afterEach(cleanup);

const SAMPLE = {
  checkedAt: "2026-11-06T12:00:00Z",
  sources: [
    { url: "https://umbrex.com/resources/market-sizing-playbook/scoping-and-framing-the-exercise/", outcome: "readable", httpStatus: 200, title: "Scoping", sections: [{ anchorId: "2-1-clarifying-the-business-question-and-decision-context", topic: "Clarify the decision", heading: "2.1 Clarifying the Business Question", excerpt: "State the decision this research feeds." }], fetchedAt: "2026-11-06T12:00:00Z", fromCache: false },
    { url: "https://umbrex.com/resources/market-sizing-playbook/data-collection-and-research-techniques/", outcome: "http-error", httpStatus: 520, fetchedAt: "2026-11-06T12:00:00Z", fromCache: true },
  ],
  note: "Observed accessibility only.",
};

describe("LiveGuidancePanel", () => {
  it("renders observed statuses and excerpts without relabeling", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) } as unknown as Response)));
    render(<LiveGuidancePanel />);
    await waitFor(() => screen.getByText(/Observed accessibility only/));
    expect(screen.getByText("readable")).toBeTruthy();
    expect(screen.getByText("HTTP 520")).toBeTruthy();
    expect(screen.getByText(/State the decision this research feeds/)).toBeTruthy();
    expect(screen.getByText(/quoted section: Clarify the decision/)).toBeTruthy();
    expect(screen.getByText(/\(cached\)/)).toBeTruthy();
  });

  it("degrades honestly when the route fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<LiveGuidancePanel />);
    await waitFor(() => screen.getByText(/Live check unavailable: offline/));
    expect(screen.getByText(/bundled guidance above still applies/)).toBeTruthy();
  });
});
