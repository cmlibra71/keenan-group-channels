import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { contactService, customerAuthTokenService, CHANNEL_ID } from "@/lib/store";

// Guarded test-only helper that MINTS a customer auth token (password reset /
// email change) and returns the plaintext, so the E2E suite can drive the
// /account/reset-password/<token> and /account/verify-email/<token> pages
// directly. The real flows only ever store the token's sha256, so a test can't
// read the emailed link — this route is the seam that lets it obtain one.
//
// Same safety envelope as /api/test/login:
//   1. Returns 404 unless E2E_LOGIN_SECRET is set (feature does not exist).
//   2. Caller must present that secret; compared in constant time, server-side.
//   3. Only ever mints tokens for throwaway test accounts whose email ends in the
//      test domain (default e2e.test, override via E2E_EMAIL_DOMAIN).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.E2E_LOGIN_SECRET;
  if (!configuredSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: { secret?: unknown; email?: unknown; type?: unknown; newEmail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  const type = typeof body.type === "string" ? body.type : "";
  const newEmail = (typeof body.newEmail === "string" ? body.newEmail : "").trim().toLowerCase();

  if (!secret || !secretsMatch(secret, configuredSecret)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const domain = (process.env.E2E_EMAIL_DOMAIN || "e2e.test").toLowerCase();
  if (!email || !email.endsWith(`@${domain}`)) {
    return NextResponse.json(
      { error: `Only @${domain} test accounts may use this endpoint.` },
      { status: 403 }
    );
  }
  if (type !== "password_reset" && type !== "email_change" && type !== "account_activation") {
    return NextResponse.json(
      { error: "type must be password_reset, email_change or account_activation." },
      { status: 400 }
    );
  }
  // An email_change token must also target a test-domain address.
  if (type === "email_change" && (!newEmail || !newEmail.endsWith(`@${domain}`))) {
    return NextResponse.json(
      { error: `email_change requires a newEmail ending @${domain}.` },
      { status: 400 }
    );
  }

  // Identity unification: tokens are contact-subject, matching the live flows.
  const contact = (await contactService.findLoginCandidate(email, CHANNEL_ID)) as {
    id: number;
  } | null;
  if (!contact) {
    return NextResponse.json({ error: "Test contact not found." }, { status: 404 });
  }

  const { token } = await customerAuthTokenService.createToken({
    contactId: contact.id,
    type,
    payload: type === "email_change" ? { newEmail } : undefined,
  });

  return NextResponse.json({ ok: true, token });
}
