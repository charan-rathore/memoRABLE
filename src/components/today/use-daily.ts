"use client";

import { useCallback, useEffect, useState } from "react";
import { DailyEngine } from "@/daily/engine";
import { IdbStore } from "@/daily/idb-store";
import { MemoryStore, type EventStore } from "@/daily/store";

export type StorageMode = "device" | "memory";

function deviceId(): string {
  try {
    const k = "memorable.device";
    let id = localStorage.getItem(k);
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem(k, id); }
    return id;
  } catch {
    return "local";
  }
}

/**
 * Opens the local engine. No network and no model on the way in: the
 * workspace is usable as soon as IndexedDB answers.
 */
export function useDaily(workspaceId = "personal") {
  const [engine, setEngine] = useState<DailyEngine | null>(null);
  const [storage, setStorage] = useState<StorageMode>("device");
  const [rev, setRev] = useState(0);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let store: EventStore;
      let mode: StorageMode = "device";
      try {
        store = await IdbStore.open();
      } catch {
        store = new MemoryStore();
        mode = "memory";
      }
      const e = await DailyEngine.open({ workspaceId, store, deviceId: deviceId() });
      if (alive) { setEngine(e); setStorage(mode); }
    })().catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "Could not open the workspace."));
    return () => { alive = false; };
  }, [workspaceId]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const run = useCallback(
    async <T,>(fn: (e: DailyEngine) => Promise<T> | T): Promise<T | undefined> => {
      if (!engine) return undefined;
      try {
        const r = await fn(engine);
        setRev((v) => v + 1);
        return r;
      } catch (err) {
        setError(err instanceof Error ? err.message : "That didn't save.");
        return undefined;
      }
    },
    [engine],
  );

  const touch = useCallback(() => setRev((v) => v + 1), []);

  return { engine, rev, run, touch, storage, online, error, clearError: () => setError(null) };
}
