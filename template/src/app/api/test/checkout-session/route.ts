import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  startTestCheckoutSession,
  endTestCheckoutSession,
  hasTestCheckoutSession,
  testCheckoutConfigured,
  TEST_CHECKOUT_TTL_SECONDS,
} from "@/lib/checkout/test-session";

// ============================================================================
// Start / end an EPHEMERAL TEST CHECKOUT SESSION.
//
// While a browser holds the cookie this mints, its checkout mounts Stripe
// Elements with the TEST publishable key, creates the PaymentIntent on the TEST
// secret key, and says so unmistakably on screen. Stripe still authorises for
// real against its test account — nothing here fakes a successful payment.
//
// Safe to ship to production, by the same rules as /api/test/login:
//   1. Inert unless TEST_CHECKOUT_SECRET is set in this environment — otherwise
//      404, i.e. the feature does not exist.
//   2. The caller must present that secret, compared in constant time, read
//      server-side only (it never reaches the client bundle).
//   3. It is never keyed on public input: there is no query string, header value
//      or magic card number that grants this. Only the secret does.
//   4. NOTHING IS WRITTEN. The capability is the cookie and only the cookie; it
//      expires in TEST_CHECKOUT_TTL_SECONDS and cannot be left switched on.
//
// Usage:
//   curl -i -c jar.txt -X POST https://<site>/api/test/checkout-session \
//     -H 'content-type: application/json' -d '{"secret":"..."}'
//   DELETE the same path (no secret needed) hands the capability back early.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time equality over fixed-length SHA-256 digests (length-safe). */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TEST_CHECKOUT_SECRET;

  // Inert unless a secret is provisioned in this environment.
  if (!configuredSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: { secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!secret || !secretsMatch(secret, configuredSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { expiresAt } = await startTestCheckoutSession();
  return NextResponse.json({
    ok: true,
    testCheckout: true,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlSeconds: TEST_CHECKOUT_TTL_SECONDS,
  });
}

/**
 * Give the capability back before it expires. No secret required: dropping a
 * capability is always allowed, and the worst a stranger can do by calling it is
 * return a browser to the ordinary LIVE checkout.
 */
export async function DELETE() {
  if (!testCheckoutConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  await endTestCheckoutSession();
  return NextResponse.json({ ok: true, testCheckout: false });
}

/** Whether the calling browser currently holds a test checkout session. */
export async function GET() {
  if (!testCheckoutConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ testCheckout: await hasTestCheckoutSession() });
}
