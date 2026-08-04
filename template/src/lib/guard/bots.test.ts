import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBot, isAllowlistedIp, buildAllowList, TIER_MULTIPLIER } from "./bots.ts";

const GOOGLEBOT =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const STOREBOT =
  "Mozilla/5.0 (compatible; Storebot-Google/1.0; +http://www.google.com/bot.html)";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

test("real crawler user-agents classify as claimed", () => {
  for (const ua of [GOOGLEBOT, BINGBOT, STOREBOT]) {
    assert.equal(classifyBot(new Headers({ "user-agent": ua })), "claimed");
  }
});

test("a normal browser is not a bot", () => {
  assert.equal(classifyBot(new Headers({ "user-agent": CHROME })), "none");
});

test("a missing user-agent is not treated as a crawler", () => {
  assert.equal(classifyBot(new Headers({})), "none");
});

test("Cloudflare's verified-bot header upgrades the tier", () => {
  const h = new Headers({ "cf-verified-bot": "true", "user-agent": CHROME });
  assert.equal(classifyBot(h), "verified");
});

test("cf-verified-bot: false does not upgrade", () => {
  const h = new Headers({ "cf-verified-bot": "false", "user-agent": GOOGLEBOT });
  assert.equal(classifyBot(h), "claimed");
});

test("crawler tiers get more budget, never less", () => {
  assert.ok(TIER_MULTIPLIER.verified > TIER_MULTIPLIER.claimed);
  assert.ok(TIER_MULTIPLIER.claimed > TIER_MULTIPLIER.none);
  assert.equal(TIER_MULTIPLIER.none, 1);
});

test("a spoofed Googlebot UA gets more room but is still bounded", () => {
  // The point: claiming to be a crawler is a budget multiplier, not a bypass.
  assert.ok(Number.isFinite(TIER_MULTIPLIER.claimed));
  assert.ok(TIER_MULTIPLIER.claimed < 100);
});

// ── Allowlist ───────────────────────────────────────────────────────────────

test("a bare IPv4 address matches exactly", () => {
  const list = buildAllowList("203.0.113.9");
  assert.equal(isAllowlistedIp("203.0.113.9", list), true);
  assert.equal(isAllowlistedIp("203.0.113.10", list), false);
});

test("a CIDR range matches its members and excludes others", () => {
  const list = buildAllowList("203.0.113.0/24");
  assert.equal(isAllowlistedIp("203.0.113.1", list), true);
  assert.equal(isAllowlistedIp("203.0.113.255", list), true);
  assert.equal(isAllowlistedIp("203.0.114.1", list), false);
});

test("multiple comma-separated entries all apply", () => {
  const list = buildAllowList("10.0.0.0/8, 203.0.113.9 , 2001:db8::1");
  assert.equal(isAllowlistedIp("10.4.5.6", list), true);
  assert.equal(isAllowlistedIp("203.0.113.9", list), true);
  assert.equal(isAllowlistedIp("2001:db8::1", list), true);
  assert.equal(isAllowlistedIp("8.8.8.8", list), false);
});

test("an empty allowlist allows nothing", () => {
  const list = buildAllowList("");
  assert.equal(isAllowlistedIp("203.0.113.9", list), false);
});

test("'unknown' is never allowlisted", () => {
  const list = buildAllowList("203.0.113.0/24");
  assert.equal(isAllowlistedIp("unknown", list), false);
  assert.equal(isAllowlistedIp("", list), false);
});

test("malformed entries are ignored rather than throwing", () => {
  const list = buildAllowList("not-a-cidr/99, 203.0.113.0/24, /8, 300.1.1.1/24");
  assert.equal(isAllowlistedIp("203.0.113.5", list), true);
  assert.equal(isAllowlistedIp("8.8.8.8", list), false);
});

test("a /32 matches only the single host", () => {
  const list = buildAllowList("203.0.113.9/32");
  assert.equal(isAllowlistedIp("203.0.113.9", list), true);
  assert.equal(isAllowlistedIp("203.0.113.8", list), false);
});
