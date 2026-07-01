// ============================================================================
// Google ID-token claim verification — the pure trust decision.
//
// No fetch, no DB, no `@/` imports: given the tokeninfo Google returned and the
// expected client id, decide whether to trust it and normalize the identity. The
// I/O (calling Google's tokeninfo endpoint, looking up / creating the customer,
// setting the session) stays in the googleSignIn action; this isolates the
// security check (audience match + verified email) so it is unit-testable
// (see google-claims.test.ts).
// ============================================================================

export type GoogleTokenInfo = {
  aud: string;
  email: string;
  email_verified: string;
  given_name?: string;
  family_name?: string;
  sub: string;
};

export type GoogleIdentity = { email: string; firstName: string; lastName: string; sub: string };

export type GoogleClaimsResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; error: string };

export function verifyGoogleClaims(
  tokenInfo: GoogleTokenInfo,
  expectedAudience: string
): GoogleClaimsResult {
  // Audience binding: the token must have been minted for OUR client id.
  if (tokenInfo.aud !== expectedAudience) {
    return { ok: false, error: "Token audience mismatch." };
  }
  // Google reports email_verified as the string "true".
  if (tokenInfo.email_verified !== "true") {
    return { ok: false, error: "Google email is not verified." };
  }
  return {
    ok: true,
    identity: {
      email: tokenInfo.email.toLowerCase(),
      firstName: tokenInfo.given_name || "",
      lastName: tokenInfo.family_name || "",
      sub: tokenInfo.sub,
    },
  };
}
