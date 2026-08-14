// Generic in-memory sliding-window rate limiter (per container) — the low-level
// primitive. For anything credential- or payment-shaped prefer
// lib/security/rate-limits.ts, which layers the named policy table (per-IP AND
// per-account budgets) and the audit line on top. Same trade-off either way: not
// shared across replicas, but it blunts abuse of a single node (e.g. a customer
// spamming "Duplicate" to create unbounded quotes).
//
// slidingWindowAllow records the hit and returns whether it is allowed: false once
// `max` hits have landed for `key` inside the trailing `windowMs`.
const hits = new Map<string, number[]>();

export function slidingWindowAllow(
  key: string,
  opts: { windowMs: number; max: number }
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < opts.windowMs);

  if (recent.length >= opts.max) {
    hits.set(key, recent); // persist the pruned window even when rejecting
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Crude unbounded-growth guard: once the map is large,
  // drop keys whose windows have fully expired; clear entirely as a last resort.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      const live = times.filter((t) => now - t < opts.windowMs);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
    if (hits.size > 5000) hits.clear();
  }

  return true;
}
