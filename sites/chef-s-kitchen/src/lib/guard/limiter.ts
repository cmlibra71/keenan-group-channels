// The rate-limit / ban state machine.
//
// Pure apart from the store it is handed: the clock is injected, so every
// behaviour below is directly testable without waiting on real time.

import { SURFACE_LIMITS, type Limit, type SurfaceClass } from "./surfaces";
import type { Counters, GuardStore, SurfaceCounter } from "./store";
import { TIER_MULTIPLIER, type BotTier } from "./bots";

export type Verdict =
  | { action: "allow" }
  | { action: "throttle"; retryAfterSec: number; surface: SurfaceClass }
  | { action: "ban"; retryAfterSec: number; strikes: number; surface: SurfaceClass };

export type CheckInput = {
  ipKey: string;
  surface: SurfaceClass;
  tier: BotTier;
  /**
   * Fractional cost. Next `<Link>` prefetches arrive in bursts of ~24 from a
   * single human scroll, so they are counted at a fraction of a real
   * navigation (see index.ts).
   */
  weight?: number;
  /**
   * Throttle but never escalate to a ban, AND ignore any ban already on record
   * for this IP.
   *
   * Both halves are load-bearing, and the second one is the one that bites.
   * The scraping guard RECORDS bans even while GUARD_MODE=log refuses to
   * enforce them (that is how the log mode observes what it would have done),
   * so a shopper's IP can be carrying a 15-minute-to-24-hour ban that nothing
   * acts on. If the credential check consulted that list it would enforce the
   * scraping guard's unproven verdict on the one surface that IS enforced —
   * and a real Keenan customer would find they cannot sign in, register, reset
   * a password or place an order, for a whole day, from an IP the shop is
   * otherwise serving happily. Credential traffic answers ONLY to its own
   * budget: throttle, with Retry-After, and never a lockout.
   */
  neverBan?: boolean;
};

export interface Limiter {
  check(input: CheckInput): Verdict;
  stats(): { counters: number; bans: number };
}

export type LimiterOptions = {
  now?: () => number;
  limits?: Partial<Record<SurfaceClass, Limit>>;
  /** Ban durations by strike, in ms. The last entry repeats for further strikes. */
  banLadderMs?: number[];
  /** A clean stretch this long resets the strike count to zero. */
  strikeDecayMs?: number;
  /** Limit breaches within `strikeWindowMs` before a throttle becomes a ban. */
  violationsBeforeBan?: number;
  strikeWindowMs?: number;
};

const MINUTE = 60_000;

function parseLadder(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const mins = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return mins.length ? mins.map((m) => m * MINUTE) : undefined;
}

const DEFAULT_LADDER = parseLadder(process.env.GUARD_BAN_LADDER_MIN) ?? [
  15 * MINUTE,
  60 * MINUTE,
  360 * MINUTE,
  1440 * MINUTE,
];

function emptyCounters(now: number): Counters {
  return { lastSeen: now, burst: {}, window: {}, violations: 0, firstViolationAt: 0 };
}

/**
 * Two-bucket approximated sliding window.
 *
 * The limiter this replaces pushed a timestamp per hit into an array and
 * re-filtered it on every request — O(n) work and unbounded memory in exactly
 * the flood it is meant to survive. Here each surface costs three numbers and
 * O(1) work regardless of request volume, at the price of a small approximation
 * at bucket boundaries (which is irrelevant when the thresholds are this
 * coarse).
 */
function tick(
  counter: SurfaceCounter | undefined,
  now: number,
  windowMs: number,
  weight: number
): { next: SurfaceCounter; estimate: number } {
  let cur = counter;
  if (!cur) cur = { start: now, cur: 0, prev: 0 };

  const elapsed = now - cur.start;
  if (elapsed >= 2 * windowMs) {
    // Idle long enough that both buckets are stale.
    cur = { start: now, cur: 0, prev: 0 };
  } else if (elapsed >= windowMs) {
    cur = { start: cur.start + windowMs, cur: 0, prev: cur.cur };
  }

  const next: SurfaceCounter = { ...cur, cur: cur.cur + weight };
  const intoBucket = now - next.start;
  const overlap = Math.max(0, 1 - intoBucket / windowMs);
  return { next, estimate: next.prev * overlap + next.cur };
}

export function createLimiter(store: GuardStore, opts?: LimiterOptions): Limiter {
  const now = opts?.now ?? (() => Date.now());
  const ladder = opts?.banLadderMs ?? DEFAULT_LADDER;
  const strikeDecayMs = opts?.strikeDecayMs ?? 24 * 60 * MINUTE;
  const violationsBeforeBan = opts?.violationsBeforeBan ?? 5;
  const strikeWindowMs = opts?.strikeWindowMs ?? 10 * MINUTE;

  function limitFor(surface: SurfaceClass): Limit | null {
    if (surface === "exempt") return null;
    return opts?.limits?.[surface] ?? SURFACE_LIMITS[surface] ?? null;
  }

  return {
    check({ ipKey, surface, tier, weight = 1, neverBan = false }): Verdict {
      const limit = limitFor(surface);
      if (!limit) return { action: "allow" };

      const t = now();

      // ── Fast path: already banned ──────────────────────────────────────────
      // One Map lookup and one integer compare, BEFORE any counter maths. This
      // is the "a blocked request is near-free" contract, and the reason a
      // banned client hammering the origin costs almost nothing.
      //
      // Skipped entirely for `neverBan` traffic — see the flag: a credential
      // request must never inherit a ban the scraping guard merely recorded.
      if (!neverBan) {
        const existingBan = store.getBan(ipKey);
        if (existingBan && existingBan.until > t) {
          return {
            action: "ban",
            retryAfterSec: Math.max(1, Math.ceil((existingBan.until - t) / 1000)),
            strikes: existingBan.strikes,
            surface,
          };
          // NOTE: deliberately does NOT extend the ban. A client with a naive
          // retry loop would otherwise be locked out forever — and behind a NAT
          // that is an entire customer's office.
        }
      }

      const multiplier = TIER_MULTIPLIER[tier] ?? 1;
      const burstMax = limit.burstMax * multiplier;
      const windowMax = limit.max * multiplier;

      const counters = store.getCounters(ipKey) ?? emptyCounters(t);
      const burst = tick(counters.burst[surface], t, limit.burstMs, weight);
      const window = tick(counters.window[surface], t, limit.windowMs, weight);

      counters.burst[surface] = burst.next;
      counters.window[surface] = window.next;
      counters.lastSeen = t;

      const overBurst = burst.estimate > burstMax;
      const overWindow = window.estimate > windowMax;

      if (!overBurst && !overWindow) {
        // A clean stretch clears the accumulated violations.
        if (counters.violations > 0 && t - counters.firstViolationAt > strikeWindowMs) {
          counters.violations = 0;
          counters.firstViolationAt = 0;
        }
        store.setCounters(ipKey, counters);
        return { action: "allow" };
      }

      const retryAfterSec = overBurst
        ? Math.max(1, Math.ceil(limit.burstMs / 1000))
        : Math.max(1, Math.ceil(limit.windowMs / 1000));

      // Crawlers are throttled but NEVER banned: a 429 with Retry-After is
      // exactly what a crawler is built to obey, whereas a ban costs indexing
      // and the Merchant feed. Credential traffic (neverBan) is treated the
      // same way, for the reason on the flag.
      if (tier !== "none" || neverBan) {
        store.setCounters(ipKey, counters);
        return { action: "throttle", retryAfterSec, surface };
      }

      if (counters.violations === 0 || t - counters.firstViolationAt > strikeWindowMs) {
        counters.violations = 1;
        counters.firstViolationAt = t;
      } else {
        counters.violations += 1;
      }

      if (counters.violations < violationsBeforeBan) {
        store.setCounters(ipKey, counters);
        return { action: "throttle", retryAfterSec, surface };
      }

      // ── Promote to a ban, walking the escalation ladder ────────────────────
      const prior = store.getBan(ipKey);
      const decayed = prior && t - prior.lastBanAt > strikeDecayMs;
      const strikes = decayed ? 1 : (prior?.strikes ?? 0) + 1;
      const durationMs = ladder[Math.min(strikes - 1, ladder.length - 1)];

      store.setBan(ipKey, { until: t + durationMs, strikes, lastBanAt: t });
      counters.violations = 0;
      counters.firstViolationAt = 0;
      store.setCounters(ipKey, counters);

      return {
        action: "ban",
        retryAfterSec: Math.max(1, Math.ceil(durationMs / 1000)),
        strikes,
        surface,
      };
    },

    stats() {
      return store.sizes();
    },
  };
}
