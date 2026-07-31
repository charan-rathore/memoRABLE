"use client";

import { useEffect } from "react";

/**
 * Root recovery: even a catastrophic UI fault offers a way back without
 * losing the deterministic core (reloading rebuilds the preloaded Atlas
 * workbench from scratch — no server state exists to lose).
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[memorable] unhandled UI error:", error.message);
  }, [error]);

  return (
    <main className="error-root">
      <div className="error-card">
        <p className="error-overline">Something went wrong</p>
        <h1 className="error-title">The workbench hit an unexpected problem.</h1>
        <p className="error-body">
          Your source was never sent anywhere. Everything runs locally. Try again; the Atlas
          example will reload exactly as it was.
        </p>
        <div className="error-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload the workbench
          </button>
        </div>
      </div>
    </main>
  );
}
