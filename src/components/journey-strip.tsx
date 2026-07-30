"use client";

import type { WorkbenchState } from "./workbench-state";
import { OUTPUT_MODE_LABELS } from "@/domain/memory/types";

export type StepStatus = "done" | "live" | "pending" | "error";

export interface JourneyStep {
  key: string;
  index: string;
  label: string;
  detail: string;
  status: StepStatus;
}

/** The persistent human journey: 01 Bring → … → 05 Publish. */
export function journeyOf(state: WorkbenchState, replayStep: number | null): JourneyStep[] {
  const hasDoc = state.document !== null;
  const hasErrors = state.errors.length > 0;
  const steps: JourneyStep[] = [
    {
      key: "bring",
      index: "01",
      label: "Bring information",
      detail: state.sourceLabel || "paste or drop to begin",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
    },
    {
      key: "understand",
      index: "02",
      label: "Understand",
      detail: hasErrors ? `couldn't understand · ${state.errors.length} ${state.errors.length === 1 ? "error" : "errors"}` : hasDoc ? "six types found" : "—",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
    },
    {
      key: "remember",
      index: "03",
      label: "Remember",
      detail: hasDoc ? `${state.document!.blocks.length} memories` : "0 memories",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
    },
    {
      key: "arrange",
      index: "04",
      label: "Arrange",
      detail: hasDoc ? `${state.document!.blocks.length} in place` : "—",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
    },
    {
      key: "publish",
      index: "05",
      label: "Publish",
      detail: state.publishedAt ? "Published" : hasDoc ? `${OUTPUT_MODE_LABELS[state.mode]} · ready` : "—",
      status: hasErrors ? "error" : state.publishedAt ? "done" : hasDoc ? "live" : "pending",
    },
  ];
  if (replayStep !== null) {
    const order = ["bring", "understand", "remember", "arrange", "publish"];
    return steps.map((step, i) =>
      order[replayStep] === step.key ? { ...step, status: "live" } : i < replayStep ? { ...step, status: "done" } : step,
    );
  }
  return steps;
}

export function JourneyStrip({ state, replayStep }: { state: WorkbenchState; replayStep: number | null }) {
  const steps = journeyOf(state, replayStep);
  return (
    // tabIndex: the strip can scroll horizontally on narrow screens; keyboard
    // users must be able to reach and scroll it (WCAG 2.1.1, axe scrollable-region-focusable).
    <nav className="pipe" aria-label="Your progress" tabIndex={0}>
      {steps.map((step, i) => (
        <span key={step.key} style={{ display: "contents" }}>
          {i > 0 && (
            <span className="psep" aria-hidden="true">
              →
            </span>
          )}
          <span className={`pstep ${step.status}`}>
            <span className="dot" aria-hidden="true" />
            <span className="k">{step.index}</span>
            <b>{step.label}</b>
            <span>{step.detail}</span>
          </span>
        </span>
      ))}
      <span className="pmeta">
        {state.document ? `publish: ${state.mode} · ${state.document.blocks.length} memories` : "nothing here yet"}
      </span>
    </nav>
  );
}
