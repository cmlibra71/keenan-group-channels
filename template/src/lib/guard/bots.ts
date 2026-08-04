// Crawler tiering and the operator escape hatch.
//
// Pure: no imports beyond the header shape.

export type HeaderLike = { get(name: string): string | null };

export type BotTier = "verified" | "claimed" | "none";

/**
 * Budget multipliers. Crawlers get MORE room, not an exemption — a scraper that
 * simply sets `User-Agent: Googlebot` should still hit a wall, just a further
 * one. Cloudflare's own verified-bot rules are the real gate in front of this.
 */
export const TIER_MULTIPLIER: Record<BotTier, number> = {
  verified: 20,
  claimed: 5,
  none: 1,
};

/**
 * User-Agent substrings (lower-cased) for crawlers we actively want indexing
 * the catalogue. Losing these costs SEO ranking and the Google Merchant feed,
 * which is why they are throttled but NEVER banned (see limiter.ts).
 */
const CLAIMED_BOT_UA = [
  "googlebot",
  "storebot-google",
  "google-inspectiontool",
  "adsbot-google",
  "mediapartners-google",
  "bingbot",
  "bingpreview",
  "applebot",
  "duckduckbot",
  "slurp",
  "facebookexternalhit",
  "linkedinbot",
  "twitterbot",
];

/**
 * `cf-verified-bot` is set by Cloudflare when it has cryptographically or
 * by-IP verified the crawler. It is NOT sent on the Free plan by default, so
 * this is an opportunistic upgrade — never a dependency. It can be populated
 * via a Cloudflare Transform Rule on `cf.client.bot`.
 *
 * Deliberately no reverse-DNS verification: that is a network round trip on the
 * hot path of every request, which is the opposite of what a guard should cost.
 */
export function classifyBot(h: HeaderLike): BotTier {
  const verified = h.get("cf-verified-bot");
  if (verified === "true" || verified === "1") return "verified";

  const ua = (h.get("user-agent") || "").toLowerCase();
  if (!ua) return "none";
  for (const needle of CLAIMED_BOT_UA) {
    if (ua.includes(needle)) return "claimed";
  }
  return "none";
}

// ── Operator allowlist ──────────────────────────────────────────────────────

type Cidr = { base: number; mask: number };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function parseAllowList(raw: string): { cidrs: Cidr[]; exact: Set<string> } {
  const cidrs: Cidr[] = [];
  const exact = new Set<string>();

  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const slash = entry.indexOf("/");
    if (slash === -1) {
      const asInt = ipv4ToInt(entry);
      if (asInt === null) exact.add(entry.toLowerCase());
      else cidrs.push({ base: asInt, mask: 0xffffffff });
      continue;
    }
    const base = ipv4ToInt(entry.slice(0, slash));
    const bits = Number(entry.slice(slash + 1));
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    cidrs.push({ base: (base & mask) >>> 0, mask });
  }

  return { cidrs, exact };
}

/**
 * GUARD_ALLOW_IPS — comma-separated IPv4 CIDRs (or bare IPv4/IPv6 addresses)
 * that bypass the guard entirely. This is the escape hatch for a customer's
 * office egress IP, uptime monitors and the deploy smoke test. Parsed once.
 */
const ALLOW = parseAllowList(process.env.GUARD_ALLOW_IPS || "");

export function isAllowlistedIp(ip: string, list = ALLOW): boolean {
  if (!ip || ip === "unknown") return false;
  if (list.exact.has(ip.toLowerCase())) return true;

  const asInt = ipv4ToInt(ip);
  if (asInt === null) return false;
  for (const { base, mask } of list.cidrs) {
    if (((asInt & mask) >>> 0) === base) return true;
  }
  return false;
}

/** Exposed so tests can build a list without touching process.env. */
export function buildAllowList(raw: string) {
  return parseAllowList(raw);
}
