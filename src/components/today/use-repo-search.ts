"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyEngine } from "@/daily/engine";
import { SearchIndex, embedText, type Arm, type SearchDoc, type SearchHit } from "@/search/engine";
import { WorkerEmbedder, modelAvailable } from "@/search/embed-client";
import { syncRepo, validRepo } from "@/search/github";
import { SearchStore, dequantize, quantize, vectorKey, type RepoState } from "@/search/store";

/**
 * Workspace search beyond notes: connected GitHub repos, and the optional
 * on-device semantic model. Arms follow the benchmark (docs/search):
 * keyword `bm25f+sig` until the model is on, then `hybrid-wsum`.
 */

export type ModelState =
  | { state: "off"; available: boolean | null }
  | { state: "loading"; loaded: number; total: number }
  | { state: "embedding"; done: number; total: number }
  | { state: "ready"; modelId: string }
  | { state: "error"; message: string };

const NOTE_PREFIX = "note:";
const MODEL_KEY = "memorable.semantic";

function noteDoc(e: { id: string; text: string; kind: string; createdAt: string }): SearchDoc {
  return { id: `${NOTE_PREFIX}${e.id}`, kind: "note", title: e.text, body: "", labels: [e.kind], source: "notes", createdAt: e.createdAt };
}

export function useRepoSearch(engine: DailyEngine | null, rev: number) {
  const index = useRef(new SearchIndex());
  const store = useRef<SearchStore | null>(null);
  const embedder = useRef<WorkerEmbedder | null>(null);
  const [repos, setRepos] = useState<RepoState[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [model, setModel] = useState<ModelState>({ state: "off", available: null });
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  // Load persisted repo documents.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await SearchStore.open();
        if (!alive) return;
        store.current = s;
        for (const d of await s.allDocs()) index.current.upsert(d);
        setRepos(await s.repos());
        bump();
      } catch { /* storage blocked: repos work for this tab only */ }
      const available = await modelAvailable();
      if (!alive) return;
      setModel((m) => (m.state === "off" ? { state: "off", available } : m));
      if (available && safeGet(MODEL_KEY) === "on") void enableSemantic();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep notes in the index (for semantic recall of notes).
  const noteIds = useRef(new Set<string>());
  useEffect(() => {
    if (!engine) return;
    const seen = new Set<string>();
    for (const e of engine.timeline(5000)) {
      const d = noteDoc(e);
      seen.add(d.id);
      const prev = index.current.docs.get(d.id);
      if (!prev || prev.title !== d.title) {
        index.current.upsert(d);
        // Same ownership-aware recovery as the connect path: a failed note
        // embed tears down only its own worker and marks the model errored.
        // A rejection from dispose-after-disable is quiet: the captured
        // worker is no longer current, so failSemantic only disposes it.
        const emb = embedder.current;
        if (emb) void embedIds([d.id]).catch(() => {
          failSemantic(emb, "Semantic search failed, showing keyword results. Turn it on again to retry.");
        });
      }
    }
    for (const id of noteIds.current) if (!seen.has(id)) index.current.remove(id);
    noteIds.current = seen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, rev]);

  /** Tear down a failed semantic worker, but only the failure's own worker:
   *  a stale rejection (a query or background indexing that raced a
   *  disable/re-enable) must not dispose or null the newer replacement, and
   *  must not clobber its state. Dispose itself is idempotent. */
  const failSemantic = useCallback((emb: WorkerEmbedder, message: string) => {
    emb.dispose();
    if (embedder.current === emb) {
      embedder.current = null;
      setModel({ state: "error", message });
    }
  }, []);

  // Bumped by disableSemantic so a re-enable racing an in-flight load does
  // not resurrect a worker the user already turned off; loadInFlight makes a
  // second enable during the first load a no-op instead of a competing load.
  const semanticGen = useRef(0);
  const loadInFlight = useRef(false);

  const embedIds = useCallback(async (ids: string[]) => {
    const emb = embedder.current;
    if (!emb) return;
    // An indexing pass belongs to the worker AND index that started it. A
    // disable swaps both, a query failure swaps the worker, and a re-enable
    // swaps both again: any continuation that finds a different current
    // pair must stop without writing vectors, store entries, or model state
    // for its stale pass (same origin pattern as the query path below).
    const idx = index.current;
    const owns = () => embedder.current === emb && index.current === idx;
    // Nothing to index yet (an empty workspace) still means the model is ready.
    if (!ids.length) { if (owns()) { setModel({ state: "ready", modelId: emb.id }); bump(); } return; }
    const docs = ids.map((id) => idx.docs.get(id)).filter(Boolean) as SearchDoc[];
    const keys = docs.map((d) => vectorKey(emb.id, d.id, embedText(d)));
    const cached = store.current ? await store.current.getVectors(keys) : new Map();
    if (!owns()) return;
    const todo: SearchDoc[] = [];
    docs.forEach((d, i) => { const c = cached.get(keys[i]!); if (c) idx.setVector(d.id, dequantize(c)); else todo.push(d); });
    let done = docs.length - todo.length;
    if (todo.length > 8) setModel({ state: "embedding", done, total: docs.length });
    for (let i = 0; i < todo.length; i += 16) {
      const batch = todo.slice(i, i + 16);
      const vecs = await emb.embedDocs(batch.map(embedText));
      if (!owns()) return;
      const toStore = batch.map((d, j) => { idx.setVector(d.id, vecs[j]!); const q = quantize(vecs[j]!); return { key: vectorKey(emb.id, d.id, embedText(d)), i8: q.i8, scale: q.scale }; });
      await store.current?.putVectors(toStore).catch(() => undefined);
      if (!owns()) return;
      done += batch.length;
      if (todo.length > 8) setModel({ state: "embedding", done, total: docs.length });
    }
    if (!owns()) return;
    setModel({ state: "ready", modelId: emb.id });
    bump();
  }, []);

  const enableSemantic = useCallback(async () => {
    if (embedder.current || loadInFlight.current) return;
    const gen = semanticGen.current;
    loadInFlight.current = true;
    setModel({ state: "loading", loaded: 0, total: 0 });
    let emb: WorkerEmbedder | null = null;
    try {
      emb = await WorkerEmbedder.load((p) => {
        // Progress from a load the user already disabled must not overwrite
        // the current state.
        if (gen === semanticGen.current) setModel({ state: "loading", loaded: p.loaded, total: p.total });
      });
      if (gen !== semanticGen.current) { emb.dispose(); return; }
      embedder.current = emb;
      index.current.attachEmbedder(emb, true);
      safeSet(MODEL_KEY, "on");
      await embedIds([...index.current.docs.keys()]);
    } catch (err) {
      // A partially ready embedder must not leak its worker; only tear down
      // the instance this attempt loaded, never a newer replacement.
      if (emb) failSemantic(emb, err instanceof Error ? err.message : "The model couldn't load.");
      else if (gen === semanticGen.current) setModel({ state: "error", message: err instanceof Error ? err.message : "The model couldn't load." });
    } finally {
      // Only the current generation clears the flag: a stale load finishing
      // after a disable/re-enable must not clear the newer load's flag.
      if (gen === semanticGen.current) loadInFlight.current = false;
    }
  }, [embedIds, failSemantic]);

  const disableSemantic = useCallback(() => {
    semanticGen.current++;
    // Unblock an immediate re-enable; the abandoned load's completion is
    // generation-guarded and disposes itself.
    loadInFlight.current = false;
    embedder.current?.dispose();
    embedder.current = null;
    const fresh = new SearchIndex();
    for (const d of index.current.docs.values()) fresh.upsert(d);
    index.current = fresh;
    safeSet(MODEL_KEY, "off");
    setModel({ state: "off", available: true });
    bump();
  }, []);

  const connect = useCallback(async (input: string, token?: string): Promise<string | null> => {
    const repo = validRepo(input);
    if (!repo) return "Use owner/repo, for example vercel/next.js.";
    const prev = repos.find((r) => r.repo === repo);
    const t = token?.trim() || prev?.token;
    setSyncing(repo);
    try {
      const res = await syncRepo(prev ?? { repo }, { ...(t ? { token: t } : {}), maxRequests: t ? 120 : 24 });
      for (const d of res.docs) index.current.upsert(d);
      await store.current?.putDocs(res.docs).catch(() => undefined);
      const items = [...index.current.docs.values()].filter((d) => d.source === repo).length;
      const state: RepoState = { ...res.cursor, items, ...(t ? { token: t } : {}), ...(res.stoppedBecause ? { error: res.stoppedBecause } : {}) };
      await store.current?.putRepo(state).catch(() => undefined);
      setRepos((rs) => [...rs.filter((r) => r.repo !== repo), state].sort((a, b) => a.repo.localeCompare(b.repo)));
      // Background doc embedding must not float a rejection: on failure the
      // model is marked errored and its worker disposed, same recovery as a
      // failed query embedding. The captured instance keeps a stale failure
      // from tearing down a newer replacement.
      const emb = embedder.current;
      if (emb) void embedIds(res.docs.map((d) => d.id)).catch(() => {
        failSemantic(emb, "Semantic search failed, showing keyword results. Turn it on again to retry.");
      });
      bump();
      return res.stoppedBecause ?? null;
    } catch (err) {
      return err instanceof Error ? err.message : "That sync failed.";
    } finally {
      setSyncing(null);
    }
  }, [repos, embedIds, failSemantic]);

  const disconnect = useCallback(async (repo: string) => {
    const ids = (await store.current?.removeSource(repo).catch(() => [])) ?? [...index.current.docs.values()].filter((d) => d.source === repo).map((d) => d.id);
    for (const id of ids) index.current.remove(id);
    for (const d of [...index.current.docs.values()]) if (d.source === repo) index.current.remove(d.id);
    await store.current?.deleteRepo(repo).catch(() => undefined);
    setRepos((rs) => rs.filter((r) => r.repo !== repo));
    bump();
  }, []);

  const search = useCallback(async (q: string, k = 6): Promise<{ notes: SearchHit[]; repos: SearchHit[]; ms: number; arm: Arm; embedMs?: number; degraded?: boolean }> => {
    let arm: Arm = embedder.current && model.state === "ready" ? "hybrid-wsum" : "bm25f+sig";
    const t0 = performance.now();
    let queryVector: Float32Array | undefined;
    let embedMs: number | undefined;
    // A failed query embedding must not lose the search: fall back to the
    // lexical arm, dispose the broken worker, and mark the model errored so
    // the next query goes straight to keywords (re-enable retries the model).
    let degraded = false;
    if (arm !== "bm25f+sig" && embedder.current) {
      const emb = embedder.current;
      const idx = index.current; // origin: worker AND index the arm was chosen against
      const te = performance.now();
      try {
        queryVector = (await emb.embedQueries([q]))[0];
        embedMs = performance.now() - te;
      } catch {
        // This query still falls back to lexical even when the failure is
        // stale (a re-enable already replaced the worker); only the teardown
        // is ownership-checked.
        failSemantic(emb, "Semantic search failed, showing keyword results. Turn it on again to retry.");
        arm = "bm25f+sig";
        degraded = true;
      }
      // A disable (or a re-enable with a different model or index) landing
      // after the await invalidates the chosen arm and the embedded vector:
      // the current index may have no vectors, or vectors in ANOTHER model's
      // space. Settle lexically on the CURRENT index rather than throwing
      // there or mixing spaces. Off/error state and worker ownership stay
      // with disable/enableSemantic and failSemantic; this path mutates none.
      if (arm !== "bm25f+sig" && (index.current !== idx || embedder.current !== emb || !index.current.denseCapable)) {
        arm = "bm25f+sig";
        queryVector = undefined;
        degraded = true;
      }
    }
    const qv = queryVector ? { queryVector } : {};
    const [n, r] = await Promise.all([
      index.current.search(q, { arm, k, allow: (id) => id.startsWith(NOTE_PREFIX), ...qv }),
      index.current.search(q, { arm, k, allow: (id) => !id.startsWith(NOTE_PREFIX), ...qv }),
    ]);
    return {
      notes: n.hits.map((h) => ({ ...h, id: h.id.slice(NOTE_PREFIX.length) })),
      repos: r.hits,
      ms: performance.now() - t0,
      arm,
      ...(embedMs !== undefined ? { embedMs } : {}),
      ...(degraded ? { degraded } : {}),
    };
    // failSemantic is a useCallback([]) - a stable reference - but list it so
    // exhaustive-deps has nothing to infer.
  }, [model.state, failSemantic]);

  const repoDocCount = [...index.current.docs.values()].filter((d) => d.source !== "notes").length;
  return { repos, syncing, model, version, repoDocCount, connect, disconnect, search, enableSemantic, disableSemantic, doc: (id: string) => index.current.docs.get(id) };
}

function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
