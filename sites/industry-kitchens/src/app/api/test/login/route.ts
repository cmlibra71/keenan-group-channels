import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { customerService, CHANNEL_ID } from "@/lib/store";
import { setSession } from "@/lib/auth";

// Guarded test-only login bypass.
//
// Establishes a real signed `session` cookie for a TEST customer without a
// password, so the E2E suite (and manual QA) can log in instantly. Designed to
// be safe to ship to every environment, including production:
//
//   1. Disabled unless `E2E_LOGIN_SECRET` is explicitly set — otherwise this
//      route returns 404, i.e. the feature does not exist.
//   2. The caller must present that secret; it is compared in constant time and
//      is read server-side only (never reaches the client bundle).
//   3. Blast-radius limit: even with the correct secret, it will ONLY ever log
//      in to throwaway test accounts whose email ends in the test domain
//      (default `e2e.test`, override via `E2E_EMAIL_DOMAIN`). It refuses to
//      impersonate any real customer.
//
// Mirrors the server-side-secret pattern used by the membership test card in
// `src/lib/actions/subscription.ts`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time equality over fixed-length SHA-256 digests (length-safe). */
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.E2E_LOGIN_SECRET;

  // Feature is inert unless a secret is provisioned in this environment.
  if (!configuredSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: { secret?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();

  if (!secret || !secretsMatch(secret, configuredSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Only ever honour test-tagged emails, no matter how valid the secret is.
  const domain = (process.env.E2E_EMAIL_DOMAIN || "e2e.test").toLowerCase();
  if (!email || !email.endsWith(`@${domain}`)) {
    return NextResponse.json(
      { error: `Only @${domain} test accounts may use this endpoint.` },
      { status: 403 }
    );
  }

  const customer = (await customerService.findByEmailAndChannel(email, CHANNEL_ID)) as {
    id: number;
    email: string;
  } | null;

  if (!customer) {
    return NextResponse.json({ error: "Test customer not found." }, { status: 404 });
  }

  await setSession(customer.id, customer.email);
  return NextResponse.json({ ok: true, customerId: customer.id, email: customer.email });
}
