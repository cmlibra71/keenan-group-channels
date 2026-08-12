/**
 * THE application rate-limit rulebook for a storefront.
 *
 * Pure by construction — no framework, no DB, no imports — so every rule below
 * is unit-tested against an injected clock (rate-limit-core.test.ts). The wiring
 * half (the audit line) lives in ./rate-limits.ts.
 *
 * This is the sibling of the portal's src/lib/security/rate-limit-core.ts and
 * deliberately reads the same: same two dimensions, same failures-only rule,
 * same audit-once-per-window. It is duplicated rather than shared because the
 * two apps ship from different repos and this file must stay dependency-free.
 *
 * Two dimensions per policy:
 *   - `ip`      — the caller. Stops one machine hammering a public endpoint.
 *   - `account` — the identity being acted ON (an email, a contact). Stops a
 *                 distributed attempt on ONE account slipping under the per-IP
 *                 budget.
 *
 * `failuresOnly` buckets count only attempts the caller got WRONG (recorded by
 * the caller via {@link noteRateLimitFailure} once it knows the answer), so
 * signing in successfully never fills a bucket and nobody can shut a real
 * customer out of their own account by spamming their address.
 *
 * The store is per-process and in-memory (same trade-off as lib/guard): with two
 * containers mid-drain an attacker gets at most 2x a budget, which is still
 * orders of magnitude below an unlimited endpoint, and there is no Redis to run.
 */

export type RateLimitScope = "ip" | "account";

export interface RateLimitBucket {
  scope: RateLimitScope;
  windowMs: number;
  max: number;
  /** Count only failed attempts (see noteRateLimitFailure). */
  failuresOnly?: boolean;
}

export interface RateLimitPolicy {
  buckets: RateLimitBucket[];
  /** What the shopper is told. Never names the bucket that tripped. */
  message: string;
}

const MINUTE = 60_000;

const POLICIES = {
  /** Customer sign-in — the form action AND the account-drawer login. */
  sign_in: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 15 * MINUTE, max: 30 },
      { scope: "account", windowMs: 15 * MINUTE, max: 10, failuresOnly: true },
    ],
  },
  /** Self-service account creation. */
  registration: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 15 * MINUTE, max: 10 },
      { scope: "account", windowMs: 60 * MINUTE, max: 5 },
    ],
  },
  /** "Forgot password" — asking for the emailed link. */
  password_reset_request: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 15 * MINUTE, max: 10 },
      { scope: "account", windowMs: 15 * MINUTE, max: 5 },
    ],
  },
  /** Spending a reset/activation token (guessing tokens is the attack). */
  password_reset_submit: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [{ scope: "ip", windowMs: 15 * MINUTE, max: 10 }],
  },
  /** A signed-in customer changing their own password. */
  password_change: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 15 * MINUTE, max: 10 },
      { scope: "account", windowMs: 15 * MINUTE, max: 10, failuresOnly: true },
    ],
  },
  /**
   * Placing an order. Deliberately generous — a false positive here costs a
   * sale — but it still caps card-testing, where a stolen card list is run
   * through checkout one number at a time.
   */
  checkout: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 10 * MINUTE, max: 60 },
      { scope: "account", windowMs: 10 * MINUTE, max: 30 },
    ],
  },
  /** Confirming a Stripe payment intent against an order number. */
  payment_confirm: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [
      { scope: "ip", windowMs: 10 * MINUTE, max: 60 },
      { scope: "account", windowMs: 10 * MINUTE, max: 20 },
    ],
  },
  /** The checkout "do you already have an account?" probe (bulk enumeration). */
  email_lookup: {
    message: "Too many attempts. Please wait a few minutes and try again.",
    buckets: [{ scope: "ip", windowMs: 5 * MINUTE, max: 20 }],
  },
} satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof POLICIES;

/** The policy table, widened so each bucket reads as a {@link RateLimitBucket}. */
export const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = POLICIES;

export interface RateLimitSubject {
  /** Caller IP bucket key (ipBucketKey(clientIpFromHeaders(...))). */
  ip: string;
  /** The identity being acted on: email, contact id, order number. */
  identifier?: string | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds the caller must wait. 0 when allowed. */
  retryAfter: number;
  scope?: RateLimitScope;
  message: string;
  /**
   * True only on the FIRST rejection of this bucket inside its window, so a
   * flood writes one audit row rather than one per request.
   */
  audit: boolean;
  limit?: number;
  windowMs?: number;
}

/** key → hit timestamps inside the window. */
const hits = new Map<string, number[]>();
/** key → when this bucket's rejection was last audited. */
const auditedAt = new Map<string, number>();

const MAX_KEYS = 20_000;

function prune(now: number): void {
  if (hits.size <= MAX_KEYS) return;
  for (const [key, times] of hits) {
    if (times.length === 0 || now - times[times.length - 1] > 60 * MINUTE) hits.delete(key);
  }
  if (hits.size > MAX_KEYS) hits.clear();
  if (auditedAt.size > MAX_KEYS) auditedAt.clear();
}

function bucketKey(
  policy: string,
  bucket: RateLimitBucket,
  subject: RateLimitSubject
): string | null {
  const value = bucket.scope === "ip" ? subject.ip : subject.identifier;
  if (!value) return null;
  return `${policy}:${bucket.scope}:${value.toLowerCase()}`;
}

function windowHits(key: string, windowMs: number, now: number): number[] {
  const recent = (hits.get(key) || []).filter((t) => t > now - windowMs);
  if (recent.length === 0) hits.delete(key);
  else hits.set(key, recent);
  return recent;
}

function retryAfterSeconds(recent: number[], windowMs: number, now: number): number {
  const oldest = recent[0] ?? now;
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

/** One audit row per bucket per window, however hard the flood pushes. */
function shouldAudit(key: string, windowMs: number, now: number): boolean {
  const last = auditedAt.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  auditedAt.set(key, now);
  return true;
}

/**
 * Check every bucket of a policy and, when all of them allow it, record the
 * attempt. Nothing is recorded on rejection — a blocked caller must not be able
 * to push the OTHER dimension's window forward.
 */
export function consumeRateLimit(
  policyName: RateLimitPolicyName,
  subject: RateLimitSubject,
  now: number = Date.now()
): RateLimitDecision {
  const policy = RATE_LIMIT_POLICIES[policyName];
  prune(now);

  const recordable: string[] = [];

  for (const bucket of policy.buckets) {
    const key = bucketKey(policyName, bucket, subject);
    if (!key) continue;

    const recent = windowHits(key, bucket.windowMs, now);
    if (recent.length >= bucket.max) {
      return {
        allowed: false,
        retryAfter: retryAfterSeconds(recent, bucket.windowMs, now),
        scope: bucket.scope,
        message: policy.message,
        audit: shouldAudit(key, bucket.windowMs, now),
        limit: bucket.max,
        windowMs: bucket.windowMs,
      };
    }

    if (!bucket.failuresOnly) recordable.push(key);
  }

  for (const key of recordable) {
    hits.set(key, [...(hits.get(key) || []), now]);
  }

  return { allowed: true, retryAfter: 0, audit: false, message: policy.message };
}

/**
 * Charge a FAILED attempt (wrong password, unknown email) to this policy's
 * `failuresOnly` buckets. Call it once the answer is known.
 */
export function noteRateLimitFailure(
  policyName: RateLimitPolicyName,
  subject: RateLimitSubject,
  now: number = Date.now()
): void {
  const policy = RATE_LIMIT_POLICIES[policyName];
  prune(now);

  for (const bucket of policy.buckets) {
    if (!bucket.failuresOnly) continue;
    const key = bucketKey(policyName, bucket, subject);
    if (!key) continue;
    hits.set(key, [...windowHits(key, bucket.windowMs, now), now]);
  }
}

/** Test seam — drops all limiter state. */
export function resetRateLimitState(): void {
  hits.clear();
  auditedAt.clear();
}
