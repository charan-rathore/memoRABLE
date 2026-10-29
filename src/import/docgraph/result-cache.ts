type CacheOptions<T> = {
  ttlMs: number; maxEntries: number; maxBytes: number; maxPending: number;
  weight: (value: T) => number; cacheable: (value: T) => boolean; now?: () => number;
};

/** Short-lived, process-local LRU. Never persists document contents to browser storage. */
export class ResultCache<T> {
  private readonly ready = new Map<string, { value: T; expires: number; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;

  private readonly options: CacheOptions<T>;
  constructor(options: CacheOptions<T>) { this.options = options; }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.options.now ?? Date.now;
    for (const [id, entry] of this.ready) {
      if (entry.expires <= now()) this.remove(id);
    }
    const hit = this.ready.get(key);
    if (hit) {
      this.ready.delete(key); this.ready.set(key, hit);
      return hit.value;
    }
    const running = this.pending.get(key);
    if (running) return running;
    // Coalescing itself is bounded; excess requests still work without retention.
    if (this.pending.size >= this.options.maxPending) return load();
    const task = Promise.resolve().then(load).then(value => {
      if (!this.options.cacheable(value)) return value;
      const bytes = this.options.weight(value) + key.length * 2;
      if (!Number.isFinite(bytes) || bytes < 0 || bytes > this.options.maxBytes) return value;
      while (this.ready.size && (this.ready.size >= this.options.maxEntries || this.bytes + bytes > this.options.maxBytes)) {
        this.remove(this.ready.keys().next().value!);
      }
      if (this.options.maxEntries > 0) {
        this.ready.set(key, { value, bytes, expires: now() + this.options.ttlMs });
        this.bytes += bytes;
      }
      return value;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, task);
    return task;
  }

  private remove(key: string) {
    const entry = this.ready.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.ready.delete(key);
  }
}
