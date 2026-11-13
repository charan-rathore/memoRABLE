import type { SearchDoc } from "./engine";
import type { GithubCursor } from "./github";

/**
 * IndexedDB persistence for connected-repo documents, sync cursors and
 * embedding vectors (int8, keyed by model and content hash so a changed
 * document or a new model never reuses a stale vector).
 */

const DB = "memorable-search";
const VERSION = 1;

export interface StoredVector { key: string; i8: Int8Array; scale: number }
export interface RepoState extends GithubCursor { token?: string; items?: number; error?: string }

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

/** Stable content hash (FNV-1a) for cache keys. */
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export const vectorKey = (modelId: string, docId: string, text: string) => `${modelId}|${docId}|${contentHash(text)}`;

export function quantize(v: Float32Array): { i8: Int8Array; scale: number } {
  let max = 0;
  for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]!));
  const scale = max / 127 || 1;
  const i8 = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) i8[i] = Math.round(v[i]! / scale);
  return { i8, scale };
}
export function dequantize(s: { i8: Int8Array; scale: number }): Float32Array {
  const out = new Float32Array(s.i8.length);
  for (let i = 0; i < out.length; i++) out[i] = s.i8[i]! * s.scale;
  return out;
}

export class SearchStore {
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<SearchStore> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("docs", { keyPath: "id" }).createIndex("source", "source");
      db.createObjectStore("repos", { keyPath: "repo" });
      db.createObjectStore("vectors", { keyPath: "key" });
    };
    return new SearchStore(await req(r));
  }

  async allDocs(): Promise<SearchDoc[]> { return req(this.db.transaction("docs").objectStore("docs").getAll()) as Promise<SearchDoc[]>; }
  async putDocs(docs: SearchDoc[]) { const tx = this.db.transaction("docs", "readwrite"); for (const d of docs) tx.objectStore("docs").put(d); await done(tx); }
  async removeSource(source: string): Promise<string[]> {
    const tx = this.db.transaction("docs", "readwrite");
    const keys = (await req(tx.objectStore("docs").index("source").getAllKeys(source))) as string[];
    for (const k of keys) tx.objectStore("docs").delete(k);
    await done(tx);
    return keys;
  }
  async repos(): Promise<RepoState[]> { return req(this.db.transaction("repos").objectStore("repos").getAll()) as Promise<RepoState[]>; }
  async putRepo(r: RepoState) { const tx = this.db.transaction("repos", "readwrite"); tx.objectStore("repos").put(r); await done(tx); }
  async deleteRepo(repo: string) { const tx = this.db.transaction("repos", "readwrite"); tx.objectStore("repos").delete(repo); await done(tx); }
  async getVectors(keys: string[]): Promise<Map<string, StoredVector>> {
    const tx = this.db.transaction("vectors");
    const os = tx.objectStore("vectors");
    const out = new Map<string, StoredVector>();
    await Promise.all(keys.map(async (k) => { const v = (await req(os.get(k))) as StoredVector | undefined; if (v) out.set(k, v); }));
    return out;
  }
  async putVectors(vs: StoredVector[]) { const tx = this.db.transaction("vectors", "readwrite"); for (const v of vs) tx.objectStore("vectors").put(v); await done(tx); }
}
