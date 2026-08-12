import "server-only";
import { headers } from "next/headers";
import { recordAudit } from "@keenan/services";
import { clientIpFromHeaders, ipBucketKey } from "@/lib/client-ip";
import { CHANNEL_ID } from "@/lib/store";
import {
  consumeRateLimit,
  noteRateLimitFailure,
  type RateLimitDecision,
  type RateLimitPolicyName,
  type RateLimitSubject,
} from "./rate-limit-core";

/**
 * Rate limiting as the server actions use it: the pure rulebook
 * (./rate-limit-core.ts) plus the audit line written when a bucket trips.
 *
 * WHY ACTIONS AND NOT ONLY MIDDLEWARE: sign-in, registration, password reset and
 * checkout are all Next server actions, which POST to whatever page the shopper
 * is on — so the middleware can only see "a POST to /checkout", never "a sign-in
 * attempt for this email". The per-account half of every policy has to live
 * here. lib/guard keeps its own coarse per-IP envelope in front (and is the half
 * that can answer a real HTTP 429, since an action cannot set a status code).
 *
 * Nothing here throttles a signed-in shopper's ordinary browsing, and the
 * credential policies charge their per-account bucket on FAILED attempts only,
 * so a working login is never the thing that fills a bucket.
 */

export { RATE_LIMIT_POLICIES, type RateLimitPolicyName } from "./rate-limit-core";
export type { RateLimitDecision } from "./rate-limit-core";

/** The caller's rate-limit bucket key, read from the request headers. */
export async function callerIpKey(): Promise<string> {
  try {
    return ipBucketKey(clientIpFromHeaders(await headers()));
  } catch {
    return "unknown";
  }
}

export interface StorefrontLimitContext {
  identifier?: string | null;
  /** Where it happened, recorded on the audit line. */
  surface: string;
  /** Set false when the identifier is not an email (contact id, order number). */
  identifierIsEmail?: boolean;
}

/**
 * Check a policy for the current request and, on rejection, write ONE audit line
 * per bucket per window. Fire-and-forget: `recordAudit` swallows its own
 * failures, and a limiter must never break the flow it guards.
 */
export async function enforceLimit(
  policy: RateLimitPolicyName,
  context: StorefrontLimitContext
): Promise<RateLimitDecision> {
  const ip = await callerIpKey();
  const decision = consumeRateLimit(policy, { ip, identifier: context.identifier });

  if (!decision.allowed && decision.audit) {
    void recordAudit(
      {
        action: "security.rate_limited",
        entityType: "security",
        newValues: {
          policy,
          scope: decision.scope,
          limit: decision.limit,
          window_seconds: decision.windowMs ? Math.round(decision.windowMs / 1000) : null,
          retry_after_seconds: decision.retryAfter,
          identifier: context.identifier ?? null,
          surface: context.surface,
          channel_id: CHANNEL_ID,
        },
      },
      {
        ipAddress: ip,
        email: context.identifierIsEmail === false ? null : (context.identifier ?? null),
      }
    );
  }

  return decision;
}

/** Charge a wrong password / unknown account to the policy's failure buckets. */
export async function noteLimitFailure(
  policy: RateLimitPolicyName,
  identifier?: string | null
): Promise<void> {
  const subject: RateLimitSubject = { ip: await callerIpKey(), identifier };
  noteRateLimitFailure(policy, subject);
}
