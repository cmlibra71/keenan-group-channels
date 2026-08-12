// The request guard, as called from proxy.ts.
//
// IMPORT DISCIPLINE (enforce in review): this module may import `next/server`
// and the pure guard modules — and NOTHING else. It is bundled into
// .next/server/middleware.js, so pulling in @keenan/services, postgres, or
// @/lib/store would drag the data layer into the middleware bundle and inflate
// cold start on every single request. Verify with:
//   grep -c postgres .next/server/middleware.js   # must be 0

import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromHeaders, ipBucketKey } from "../client-ip";
import { classifySurface, isCredentialPath } from "./surfaces";
import { classifyBot, isAllowlistedIp } from "./bots";
import { createLimiter, type Verdict } from "./limiter";
import { getSharedStore } from "./store";

export type GuardMode = "off" | "log" | "enforce";

function readMode(): GuardMode {
  const raw = (process.env.GUARD_MODE || "").toLowerCase();
  if (raw === "off" || raw === "enforce") return raw;
  // Default to `log`: the guard computes and reports verdicts but blocks
  // nothing, so it can be shipped and observed against real traffic before it
  // is ever allowed to turn a customer away.
  return "log";
}

const MODE = readMode();

/**
 * The credential/payment POST limiter is its OWN switch, and defaults to
 * `enforce` rather than following GUARD_MODE.
 *
 * GUARD_MODE governs the SCRAPING guard, which is deliberately shipped in `log`
 * so it can be observed against real traffic before it turns a shopper away.
 * Credential stuffing and card testing are a different problem: the budget is
 * far above any human, so there is nothing to observe first, and leaving it
 * unenforced would mean the storefront has no 429 at all.
 */
function readCredentialMode(): GuardMode {
  const raw = (process.env.CREDENTIAL_GUARD_MODE || "").toLowerCase();
  if (raw === "off" || raw === "log") return raw;
  return "enforce";
}

const CREDENTIAL_MODE = readCredentialMode();
const CONTACT = process.env.GUARD_CONTACT || "";

/**
 * A Next `<Link>` prefetch is a real request but not a real page view — a
 * category grid can fire ~24 of them from one human scroll. Counting them at a
 * fraction keeps honest browsing well inside the budget.
 */
const PREFETCH_WEIGHT = 0.25;

/**
 * A request carrying the session cookie gets 3x the budget (weight 1/3).
 * This is a HEURISTIC, not authentication — verifying the cookie would mean
 * HMAC work on the hot path of every request. Its mere presence is still a
 * decent signal, because it is only set after a successful login, and it is the
 * cheapest mitigation available for a NAT'd office sharing one egress IP.
 */
const SESSION_WEIGHT = 1 / 3;

let limiter: ReturnType<typeof createLimiter> | null = null;
function getLimiter() {
  if (!limiter) limiter = createLimiter(getSharedStore());
  return limiter;
}

// Logging is itself rate-limited. Emitting a line per blocked request turns the
// guard into a log-volume amplifier — and, on a container with a slow stdout
// consumer, into the DoS it was meant to prevent.
const logCounts = new Map<string, number>();
function shouldLog(ipKey: string): boolean {
  const seen = (logCounts.get(ipKey) ?? 0) + 1;
  logCounts.set(ipKey, seen);
  if (logCounts.size > 10_000) logCounts.clear(); // pure log bookkeeping, safe to drop
  return seen === 1 || seen % 100 === 0;
}

function blockedResponse(req: NextRequest, verdict: Verdict): NextResponse {
  if (verdict.action === "allow") return NextResponse.next();

  const retryAfter = String(verdict.retryAfterSec);
  const isApi = req.nextUrl.pathname.startsWith("/api/");

  const headers = new Headers({
    "Retry-After": retryAfter,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "X-Guard": verdict.action,
  });

  if (isApi) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new NextResponse(
      JSON.stringify({ error: "rate_limited", retryAfter: verdict.retryAfterSec }),
      { status: 429, headers }
    );
  }

  const minutes = Math.max(1, Math.round(verdict.retryAfterSec / 60));
  headers.set("Content-Type", "text/plain; charset=utf-8");
  const contact = CONTACT ? `\nIf this is a mistake, contact ${CONTACT}.` : "";
  return new NextResponse(
    `429 Too Many Requests\n\nAutomated traffic detected. Please try again in ${minutes} minute${
      minutes === 1 ? "" : "s"
    }.${contact}\n`,
    { status: 429, headers }
  );
}

/**
 * Returns a 429 response when the request should be blocked, or null to let it
 * through.
 *
 * FAILS OPEN: any unexpected error degrades to pre-guard behaviour rather than
 * 500-ing the storefront. The matcher now covers the whole site, so the blast
 * radius of a bug in here is the entire shop — this catch is not optional.
 */
export function guardRequest(req: NextRequest): NextResponse | null {
  if (MODE === "off" && CREDENTIAL_MODE === "off") return null;

  try {
    const { pathname } = req.nextUrl;
    let surface = classifySurface(pathname);
    if (surface === "exempt") return null;

    // Server actions POST to ordinary page paths (checkout fires several), so
    // they must not be charged against the page budget.
    if (req.headers.get("next-action")) surface = "api";

    const ip = clientIpFromHeaders(req.headers);
    const ipKey = ipBucketKey(ip);
    const tier = classifyBot(req.headers);

    // ── Credential / payment POSTs ─────────────────────────────────────────
    // Sign-in, register, password reset/change and placing an order are Next
    // server actions, so from here they are just POSTs to /account or
    // /checkout. This is the coarse per-IP envelope that can answer a real HTTP
    // 429 with Retry-After; the per-ACCOUNT half (and the audit line) lives in
    // lib/security/rate-limits.ts, which is the only layer that can see WHICH
    // account an action is for. Never bans — see limiter.ts `neverBan`.
    if (
      CREDENTIAL_MODE !== "off" &&
      req.method === "POST" &&
      isCredentialPath(pathname)
    ) {
      const credentialVerdict = getLimiter().check({
        ipKey,
        surface: "credential",
        tier,
        weight: 1,
        neverBan: true,
      });
      if (credentialVerdict.action !== "allow" && !isAllowlistedIp(ip)) {
        if (shouldLog(ipKey)) {
          console.warn(
            `[guard] ${CREDENTIAL_MODE === "log" ? "WOULD " : ""}throttle credential ` +
              `ip=${ipKey} path=${pathname} retryAfter=${credentialVerdict.retryAfterSec}s`
          );
        }
        if (CREDENTIAL_MODE === "enforce") return blockedResponse(req, credentialVerdict);
      }
    }

    if (MODE === "off") return null;

    let weight = 1;
    if (req.headers.get("next-router-prefetch")) weight *= PREFETCH_WEIGHT;
    if (req.cookies.get("session")) weight *= SESSION_WEIGHT;

    const verdict = getLimiter().check({ ipKey, surface, tier, weight });
    if (verdict.action === "allow") return null;

    // Only consulted once a request would otherwise be blocked, so the operator
    // escape hatch costs nothing on the happy path.
    if (isAllowlistedIp(ip)) return null;

    if (shouldLog(ipKey)) {
      console.warn(
        `[guard] ${MODE === "log" ? "WOULD " : ""}${verdict.action} ip=${ipKey} ` +
          `surface=${verdict.surface} path=${pathname} retryAfter=${verdict.retryAfterSec}s` +
          (verdict.action === "ban" ? ` strikes=${verdict.strikes}` : "")
      );
    }

    if (MODE === "log") return null;
    return blockedResponse(req, verdict);
  } catch (err) {
    console.error("[guard] failed open:", err);
    return null;
  }
}
