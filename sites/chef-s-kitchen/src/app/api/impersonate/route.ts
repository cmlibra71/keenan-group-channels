import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { contactService, CHANNEL_ID } from "@/lib/store";
import { setSession } from "@/lib/auth";

// Admin "Log-in as Contact" bridge (B3 impersonation).
//
// The portal MINTS a short-lived signed token (60s TTL) after a strict
// MANAGE_CONTACTS + super-admin gate and an audit_log write; this route VERIFIES
// that token and establishes a real customer session for the contact. Designed to
// be safe to ship to every environment, including production, mirroring the
// guarded `api/test/login` posture:
//
//   1. INERT unless `IMPERSONATION_SECRET` is explicitly set — otherwise this
//      route returns 404, i.e. the feature does not exist.
//   2. The token is an HMAC-SHA256 over a base64url JSON payload
//      ({ contactId, email, iss, exp }), verified in CONSTANT TIME against
//      `IMPERSONATION_SECRET` (read server-side only) with an `exp` (epoch
//      seconds) TTL check. A tampered/expired/malformed token is rejected 401.
//   3. Unlike test/login it accepts REAL customer emails — the secret + short TTL
//      + HMAC + the portal's audit trail are the safety envelope. The subject is
//      re-resolved on THIS channel via findLoginCandidate, so a token minted for a
//      contact on another storefront cannot log in here.
//
// Keep the token codec byte-identical to the portal signer
// (`src/lib/contacts/impersonation-token.ts`).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verify + decode an impersonation token in constant time. Returns null on any
 *  tamper/expiry/malformation. */
function verifyImpersonationToken(
  token: string,
  secret: string
): { contactId: number; email: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: { contactId?: unknown; email?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!exp || Math.floor(Date.now() / 1000) > exp) return null; // expired

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const contactId = typeof payload.contactId === "number" ? payload.contactId : 0;
  if (!email || !contactId) return null;

  return { contactId, email };
}

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.IMPERSONATION_SECRET;

  // Feature is inert unless a secret is provisioned in this environment.
  if (!configuredSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const claims = token ? verifyImpersonationToken(token, configuredSecret) : null;
  if (!claims) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  // Identity unification: sessions are contact-subject; resolve the same login
  // candidate the real sign-in flow would, scoped to THIS channel.
  const contact = (await contactService.findLoginCandidate(claims.email, CHANNEL_ID)) as {
    id: number;
    email: string;
  } | null;
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 401 });
  }

  // rememberDevice:false — this is a STAFF browser wearing a customer's session
  // (card upTMAqRc). Leaving the customer's email remembered here would put it on
  // the sign-in panel of whoever uses that machine next.
  await setSession(contact.id, contact.email, { rememberDevice: false });
  // Relative Location so the browser resolves it against the storefront origin it's
  // on (not `request.url`, which behind the reverse proxy can be an internal host).
  // The Set-Cookie from setSession() is attached to this response by the framework.
  return new NextResponse(null, { status: 302, headers: { Location: "/account" } });
}
