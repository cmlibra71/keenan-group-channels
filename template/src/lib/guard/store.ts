// Bounded in-memory state for the request guard.
//
// ── Why globalThis, and why it is load-bearing ──────────────────────────────
// Next 16 ALWAYS runs proxy.ts on the Node.js runtime (it throws on a `runtime`
// export), and loads it with a plain require() into the same V8 isolate as the
// route handlers — but from a SEPARATE bundle (.next/server/middleware.js vs
// the app-router chunks). A plain module-level `const map = new Map()` would
// therefore be instantiated TWICE, and the two copies would each see roughly
// half the traffic while believing they saw all of it.
//
// Symbol.for() reaches the cross-realm symbol registry, so both bundles resolve
// the identical object. A string property on globalThis would also work, but a
// registered symbol cannot collide with unrelated globals.
//
// Pure: no imports. Anything pulled in here is paid for on every request.

export type SurfaceCounter = {
  /** Start of the current fixed bucket. */
  start: number;
  /** Hits in the current bucket. */
  cur: number;
  /** Hits in the previous bucket, used to weight the sliding estimate. */
  prev: number;
};

export type Counters = {
  lastSeen: number;
  /** Keyed by surface class; both windows tracked per surface. */
  burst: Record<string, SurfaceCounter>;
  window: Record<string, SurfaceCounter>;
  /** Recent limit breaches, used to decide when to promote to a ban. */
  violations: number;
  firstViolationAt: number;
};

export type Ban = {
  until: number;
  strikes: number;
  lastBanAt: number;
};

export interface GuardStore {
  getCounters(key: string): Counters | undefined;
  setCounters(key: string, value: Counters): void;
  getBan(key: string): Ban | undefined;
  setBan(key: string, value: Ban): void;
  clearBan(key: string): void;
  sizes(): { counters: number; bans: number };
}

export type MemoryStoreOptions = {
  maxCounters?: number;
  maxBans?: number;
};

const DEFAULT_MAX_COUNTERS = Math.max(
  1000,
  Number(process.env.GUARD_MAX_KEYS) || 20_000
);
const DEFAULT_MAX_BANS = 5_000;

/**
 * Counters and bans live in SEPARATE maps with separate caps, and this is the
 * whole point of the design.
 *
 * The limiter this replaces (lib/rate-limit.ts) calls `hits.clear()` once its
 * single map passes 5,000 keys — so a DISTRIBUTED scrape from tens of thousands
 * of addresses disarms the limiter at exactly the moment it is needed. Here a
 * flood churns only the counters map; the ban list, which is the thing actually
 * holding attackers off, is untouched and 4x smaller than the churn surface.
 *
 * Eviction is LRU, never clear-all: a JS Map preserves insertion order, and we
 * re-insert on every write, so deleting from the front drops the
 * least-recently-seen key — precisely the one least likely to matter.
 */
export function createMemoryStore(opts?: MemoryStoreOptions): GuardStore {
  const maxCounters = opts?.maxCounters ?? DEFAULT_MAX_COUNTERS;
  const maxBans = opts?.maxBans ?? DEFAULT_MAX_BANS;

  const counters = new Map<string, Counters>();
  const bans = new Map<string, Ban>();

  function trim(map: Map<string, unknown>, max: number): void {
    while (map.size > max) {
      const oldest = map.keys().next();
      if (oldest.done) return;
      map.delete(oldest.value);
    }
  }

  return {
    getCounters(key) {
      return counters.get(key);
    },
    setCounters(key, value) {
      // delete-then-set moves the key to the end = most-recently-used.
      counters.delete(key);
      counters.set(key, value);
      trim(counters, maxCounters);
    },
    getBan(key) {
      return bans.get(key);
    },
    setBan(key, value) {
      bans.delete(key);
      bans.set(key, value);
      trim(bans, maxBans);
    },
    clearBan(key) {
      bans.delete(key);
    },
    sizes() {
      return { counters: counters.size, bans: bans.size };
    },
  };
}

const STORE_KEY = Symbol.for("keenan.guard.store.v1");

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: GuardStore };

/** The process-wide store, shared across the middleware and app bundles. */
export function getSharedStore(): GuardStore {
  const g = globalThis as GlobalWithStore;
  if (!g[STORE_KEY]) g[STORE_KEY] = createMemoryStore();
  return g[STORE_KEY];
}
