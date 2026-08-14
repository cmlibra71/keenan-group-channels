// What the middleware guard needs to tell the audit log, and the only way it
// can tell it.
//
// IMPORT DISCIPLINE: pure, no imports — this is bundled into
// .next/server/middleware.js alongside the rest of lib/guard, which may not
// pull in @keenan/services or postgres (see ./index.ts). So the guard cannot
// write an audit row itself: it leaves the event here and the app side
// (lib/security/guard-audit.ts, started from instrumentation.ts) drains it and
// writes the row with the real audit machinery.
//
// The queue lives on a registered symbol for the same reason the guard store
// does: proxy.ts and the app router are separate bundles in ONE process, so a
// plain module-level array would be instantiated twice and the drain would
// always find an empty one. See ./store.ts for the full explanation.

export type GuardEvent = {
  /** When the bucket tripped (ms epoch). */
  at: number;
  /** Always "credential" today — the only guard surface that answers a 429. */
  policy: "credential";
  /** The masked-to-a-bucket client IP (ipBucketKey). */
  ipKey: string;
  path: string;
  retryAfterSec: number;
  /** false when CREDENTIAL_GUARD_MODE=log, i.e. the trip was observed, not enforced. */
  enforced: boolean;
};

const EVENTS_KEY = Symbol.for("keenan.guard.events.v1");

/**
 * Hard cap. The queue is telemetry, and telemetry must never become the
 * memory-exhaustion bug in the component whose job is surviving a flood. One
 * event per IP per window keeps this far from the cap in practice.
 */
const MAX_QUEUED = 500;

type GlobalWithEvents = typeof globalThis & { [EVENTS_KEY]?: GuardEvent[] };

function queue(): GuardEvent[] {
  const g = globalThis as GlobalWithEvents;
  if (!g[EVENTS_KEY]) g[EVENTS_KEY] = [];
  return g[EVENTS_KEY];
}

/** Record a tripped bucket for the app side to audit. Never throws. */
export function pushGuardEvent(event: GuardEvent): void {
  try {
    const q = queue();
    // Drop the OLDEST on overflow: the newest trips are the ones an operator
    // is looking at.
    if (q.length >= MAX_QUEUED) q.splice(0, q.length - MAX_QUEUED + 1);
    q.push(event);
  } catch {
    /* telemetry must never break a request */
  }
}

/** Take everything queued so far, leaving the queue empty. */
export function drainGuardEvents(): GuardEvent[] {
  const g = globalThis as GlobalWithEvents;
  const q = g[EVENTS_KEY];
  if (!q || q.length === 0) return [];
  g[EVENTS_KEY] = [];
  return q;
}
