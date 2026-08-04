// Authoritative client IP resolution, shared by the request guard (proxy.ts),
// server actions and route handlers.
//
// Deliberately framework-free: no `next/headers`, no `next/server`. The guard
// runs inside the SEPARATE middleware bundle (see lib/guard/store.ts), so
// anything imported here is paid for on every request — and staying pure keeps
// it trivially testable with a bare `new Headers()`.
//
// Usage:
//   server action  → clientIpFromHeaders(await headers())
//   route handler  → clientIpFromHeaders(req.headers)

export type HeaderLike = { get(name: string): string | null };

/**
 * SECURITY: `X-Forwarded-For` is a client-APPENDABLE list. The LEFT-most entry
 * is whatever the caller wrote and must never be trusted — an attacker who
 * rotates it mints unlimited rate-limit buckets, and can also frame a real IP
 * into a ban. We count hops in from the RIGHT instead, which a client cannot
 * forge because each proxy appends the peer address it actually saw.
 *
 * 1 = Caddy only (today). 2 = Cloudflare → Caddy (after the CDN cutover).
 */
const XFF_TRUSTED_HOPS = Math.max(1, Number(process.env.GUARD_XFF_TRUSTED_HOPS) || 1);

/**
 * `CF-Connecting-IP` is only authoritative once the origin can ONLY be reached
 * through Cloudflare (EC2 security group locked to Cloudflare's ranges). Until
 * then any client can set it directly against the origin IP, so trusting it is
 * strictly worse than not having a guard at all. Default OFF; flip to `true`
 * only after the lockdown is verified.
 */
const TRUST_CF_IP = process.env.GUARD_TRUST_CF_IP === "true";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// Shape check only — we are gate-keeping a Map key, not parsing for routing.
const IPV6 = /^[0-9a-f:]+$/;

function isIpv4(value: string): boolean {
  const m = IPV4.exec(value);
  if (!m) return false;
  return m.slice(1).every((octet) => {
    const n = Number(octet);
    return n <= 255 && String(n) === String(Number(octet));
  });
}

function isIpv6(value: string): boolean {
  // Must contain a "::" run or exactly 8 groups; reject the degenerate cases
  // that would otherwise let arbitrary header junk become a distinct key.
  if (!IPV6.test(value)) return false;
  if (!value.includes(":")) return false;
  const groups = value.split(":");
  if (groups.length > 8) return false;
  if (!value.includes("::") && groups.length !== 8) return false;
  return groups.every((g) => g.length <= 4);
}

/**
 * Normalise one candidate value to a canonical IP, or "" if it isn't one.
 *
 * The validation is load-bearing: without it, header content becomes an
 * unbounded keyspace and an attacker evicts the entire guard store by sending
 * garbage.
 */
function normalise(raw: string): string {
  let value = raw.trim().toLowerCase();
  if (!value) return "";

  // "[2001:db8::1]:443" → "2001:db8::1"
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close === -1) return "";
    value = value.slice(1, close);
    return isIpv6(value) ? value : "";
  }

  // "1.2.3.4:5678" → "1.2.3.4". Only ever strip a port when what remains is
  // IPv4 — a bare IPv6 address is full of colons and must not be truncated.
  const lastColon = value.lastIndexOf(":");
  if (lastColon > 0 && value.indexOf(":") === lastColon) {
    const head = value.slice(0, lastColon);
    if (isIpv4(head)) return head;
  }

  if (isIpv4(value)) return value;
  if (isIpv6(value)) return value;
  return "";
}

/**
 * Overrides exist so the env-dependent branches are testable; production always
 * omits them and gets the module constants above (env read once, not per call).
 */
export type ClientIpOptions = { trustCfIp?: boolean; xffTrustedHops?: number };

/** Authoritative client IP, or "unknown". Never throws. */
export function clientIpFromHeaders(h: HeaderLike, opts?: ClientIpOptions): string {
  const trustCfIp = opts?.trustCfIp ?? TRUST_CF_IP;
  const hops = Math.max(1, opts?.xffTrustedHops ?? XFF_TRUSTED_HOPS);

  if (trustCfIp) {
    const cf = normalise(h.get("cf-connecting-ip") || "");
    if (cf) return cf;
  }

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Count in from the right by the number of proxies we control.
      const idx = Math.max(0, parts.length - hops);
      const picked = normalise(parts[idx]);
      if (picked) return picked;
    }
  }

  const realIp = normalise(h.get("x-real-ip") || "");
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Rate-limit bucket key. IPv4 is used as-is; IPv6 collapses to its /64 prefix.
 *
 * The IPv6 collapse is load-bearing too: a single attacker is routinely handed
 * a /64, i.e. 2^64 addresses. Keying on the full address would let one host
 * mint a fresh bucket per request AND evict every legitimate entry from the
 * store. Providers allocate /64 to one customer, so this is the right grain.
 */
export function ipBucketKey(ip: string): string {
  if (!ip || ip === "unknown") return "unknown";
  if (!ip.includes(":")) return ip;

  // Expand "::" enough to read the first four groups.
  const [head] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const prefix: string[] = [];
  for (let i = 0; i < 4; i++) prefix.push(headGroups[i] ?? "0");
  return `${prefix.join(":")}::/64`;
}
