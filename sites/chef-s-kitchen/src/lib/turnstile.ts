// ============================================================================
// Cloudflare Turnstile verification.
//
// Works on any site — it does NOT require the domain to be proxied through
// Cloudflare, so it ships independently of the wider CDN/WAF rollout.
//
// FAIL-OPEN WHEN UNCONFIGURED, FAIL-CLOSED WHEN CONFIGURED: with no secret set
// (local dev, a site that hasn't been given keys yet) verification is skipped
// so forms still work; once a secret exists, a missing or bad token is a hard
// rejection. The honeypot + rate limits still apply either way.
// ============================================================================

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string | undefined, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured on this site yet
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // A Cloudflare outage must not take the contact form down with it; the
    // honeypot, dwell check and rate limits remain in force.
    console.warn("[turnstile] verification unreachable — allowing through");
    return true;
  }
}
