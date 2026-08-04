import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFromHeaders, ipBucketKey } from "./client-ip.ts";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

// ── X-Forwarded-For: the spoofing surface ───────────────────────────────────

test("XFF: the LEFT-most (attacker-supplied) value never wins", () => {
  // Caddy appends the real peer, so the real client is the right-most hop.
  const headers = h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
  assert.equal(clientIpFromHeaders(headers, { xffTrustedHops: 1 }), "203.0.113.9");
});

test("XFF: an attacker chaining many fake hops still cannot shift the bucket", () => {
  const headers = h({
    "x-forwarded-for": "9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.9",
  });
  assert.equal(clientIpFromHeaders(headers, { xffTrustedHops: 1 }), "203.0.113.9");
});

test("XFF: hops=2 reads through Cloudflare to the real client", () => {
  // Cloudflare appends the client, Caddy appends Cloudflare.
  const headers = h({ "x-forwarded-for": "203.0.113.9, 172.68.1.1" });
  assert.equal(clientIpFromHeaders(headers, { xffTrustedHops: 2 }), "203.0.113.9");
});

test("XFF: hop count larger than the list clamps to the left-most rather than undefined", () => {
  const headers = h({ "x-forwarded-for": "203.0.113.9" });
  assert.equal(clientIpFromHeaders(headers, { xffTrustedHops: 5 }), "203.0.113.9");
});

test("XFF: a single entry is the client", () => {
  assert.equal(
    clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.9" }), { xffTrustedHops: 1 }),
    "203.0.113.9"
  );
});

// ── CF-Connecting-IP: must stay inert until the origin is locked down ───────

test("CF-Connecting-IP is IGNORED when trustCfIp is off", () => {
  const headers = h({
    "cf-connecting-ip": "1.2.3.4",
    "x-forwarded-for": "203.0.113.9",
  });
  assert.equal(
    clientIpFromHeaders(headers, { trustCfIp: false, xffTrustedHops: 1 }),
    "203.0.113.9"
  );
});

test("CF-Connecting-IP wins when trustCfIp is on", () => {
  const headers = h({
    "cf-connecting-ip": "1.2.3.4",
    "x-forwarded-for": "203.0.113.9",
  });
  assert.equal(clientIpFromHeaders(headers, { trustCfIp: true }), "1.2.3.4");
});

test("a garbage CF header falls through to XFF rather than poisoning the key", () => {
  const headers = h({
    "cf-connecting-ip": "not-an-ip",
    "x-forwarded-for": "203.0.113.9",
  });
  assert.equal(
    clientIpFromHeaders(headers, { trustCfIp: true, xffTrustedHops: 1 }),
    "203.0.113.9"
  );
});

// ── Fallbacks ───────────────────────────────────────────────────────────────

test("x-real-ip is used when there is no XFF", () => {
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
});

test("no usable headers yields 'unknown'", () => {
  assert.equal(clientIpFromHeaders(h({})), "unknown");
});

test("junk in every header yields 'unknown', not a new bucket per request", () => {
  const headers = h({
    "x-forwarded-for": "<script>alert(1)</script>",
    "x-real-ip": "'; DROP TABLE products; --",
  });
  assert.equal(clientIpFromHeaders(headers), "unknown");
});

// ── Normalisation ───────────────────────────────────────────────────────────

test("an IPv4 port suffix is stripped", () => {
  assert.equal(
    clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.9:54321" }), { xffTrustedHops: 1 }),
    "203.0.113.9"
  );
});

test("a bracketed IPv6 with a port is unwrapped, not truncated", () => {
  assert.equal(
    clientIpFromHeaders(h({ "x-forwarded-for": "[2001:db8::1]:443" }), { xffTrustedHops: 1 }),
    "2001:db8::1"
  );
});

test("a bare IPv6 address survives intact (colons are not treated as a port)", () => {
  assert.equal(
    clientIpFromHeaders(h({ "x-real-ip": "2001:db8:1:2:3:4:5:6" })),
    "2001:db8:1:2:3:4:5:6"
  );
});

test("out-of-range octets are rejected", () => {
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "999.1.1.1" })), "unknown");
});

test("values are lower-cased and trimmed so one client cannot hold two buckets", () => {
  assert.equal(clientIpFromHeaders(h({ "x-real-ip": "  2001:DB8::1  " })), "2001:db8::1");
});

// ── Bucket keys ─────────────────────────────────────────────────────────────

test("IPv4 buckets on the exact address", () => {
  assert.equal(ipBucketKey("203.0.113.9"), "203.0.113.9");
});

test("IPv6 addresses in the same /64 share ONE bucket", () => {
  // Without this an attacker with a routine /64 mints 2^64 buckets and evicts
  // every legitimate entry from the store.
  const a = ipBucketKey("2001:db8:1:2:3:4:5:6");
  const b = ipBucketKey("2001:db8:1:2:9:9:9:9");
  assert.equal(a, b);
});

test("IPv6 addresses in DIFFERENT /64s do not collide", () => {
  assert.notEqual(ipBucketKey("2001:db8:1:2::1"), ipBucketKey("2001:db8:1:3::1"));
});

test("a compressed IPv6 prefix still yields a stable key", () => {
  assert.equal(ipBucketKey("2001:db8::1"), ipBucketKey("2001:db8::9999"));
});

test("'unknown' stays a single shared bucket", () => {
  assert.equal(ipBucketKey("unknown"), "unknown");
  assert.equal(ipBucketKey(""), "unknown");
});
