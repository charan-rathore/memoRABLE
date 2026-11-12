import { redactEvent, type EventStore } from "./store";
import type { DailyEvent } from "./types";

const DB = "memorable-daily";
const VERSION = 1;
const EVENTS = "events";

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });

/** Browser event store. Everything stays on this device; there is no sync. */
export class IdbStore implements EventStore {
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IdbStore> {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available in this browser.");
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const os = r.result.createObjectStore(EVENTS, { keyPath: "id" });
      os.createIndex("workspace", "workspaceId");
    };
    return new IdbStore(await req(r));
  }

  async load(workspaceId: string): Promise<DailyEvent[]> {
    const tx = this.db.transaction(EVENTS, "readonly");
    const all = await req(tx.objectStore(EVENTS).index("workspace").getAll(workspaceId));
    return (all as DailyEvent[]).sort((a, b) => a.seq - b.seq);
  }

  async append(event: DailyEvent): Promise<void> {
    const tx = this.db.transaction(EVENTS, "readwrite");
    tx.objectStore(EVENTS).put(event);
    await done(tx);
  }

  async redact(workspaceId: string, entryId: string): Promise<number> {
    const tx = this.db.transaction(EVENTS, "readwrite");
    const index = tx.objectStore(EVENTS).index("workspace");
    let n = 0;
    await new Promise<void>((resolve, reject) => {
      const c = index.openCursor(IDBKeyRange.only(workspaceId));
      c.onerror = () => reject(c.error);
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return resolve();
        const red = redactEvent(cur.value as DailyEvent, entryId);
        if (red) { cur.update(red); n++; }
        cur.continue();
      };
    });
    await done(tx);
    return n;
  }
}
