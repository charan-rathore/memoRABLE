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
      detail: hasErrors
        ? `couldn't understand · ${state.errors.length} ${state.errors.length === 1 ? "error" : "errors"}`
        : hasDoc
          ? "six types found"
          : "waiting",
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
      detail: hasDoc ? `${state.document!.blocks.length} in place` : "·",
      status: hasErrors ? "error" : hasDoc ? "done" : "pending",
    },
    {
      key: "publish",
      index: "05",
      label: "Publish",
      detail: state.publishedAt ? "Published" : hasDoc ? `${OUTPUT_MODE_LABELS[state.mode]} · ready` : "·",
      status: hasErrors ? "error" : state.publishedAt ? "done" : hasDoc ? "live" : "pending",
    },
  ];
  if (replayStep !== null) {
    const order = ["bring", "understand", "remember", "arrange", "publish"];
    return steps.map((step, i) =>
      order[replayStep] === step.key
        ? { ...step, status: "live" }
        : i < replayStep
          ? { ...step, status: "done" }
          : step,
    );
  }
  return steps;
}

export function JourneyStrip({
  state,
  replayStep,
  onStep,
}: {
  state: WorkbenchState;
  replayStep: number | null;
  onStep?: (key: string) => void;
}) {
  const steps = journeyOf(state, replayStep);
  return (
    <nav className="pipe" aria-label="Your progress" tabIndex={0}>
      {steps.map((step, i) => (
        <span key={step.key} style={{ display: "contents" }}>
          {i > 0 && (
            <span className="psep" aria-hidden="true">
              →
            </span>
          )}
          <button
            type="button"
            className={`pstep ${step.status}`}
            onClick={() => onStep?.(step.key)}
            aria-current={step.status === "live" ? "step" : undefined}
            title={`Go to ${step.label}`}
          >
            <span className="dot" aria-hidden="true" />
            <span className="k">{step.index}</span>
            <b>{step.label}</b>
            <span>{step.detail}</span>
          </button>
        </span>
      ))}
      <button
        type="button"
        className="pmeta"
        onClick={() => onStep?.(state.document ? "publish" : "bring")}
        title={state.document ? "Jump to publish" : "Bring something in"}
      >
        {state.document ? `publish: ${state.mode} · ${state.document.blocks.length} memories` : "nothing here yet"}
      </button>
    </nav>
  );
}
