import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "./limiter.ts";
import { createMemoryStore } from "./store.ts";
import type { SurfaceClass } from "./surfaces.ts";

const MINUTE = 60_000;

/** A limiter on a fake clock with small, easy-to-reason-about limits. */
function harness(over?: Parameters<typeof createLimiter>[1]) {
  let clock = 1_000_000;
  const store = createMemoryStore();
  const limiter = createLimiter(store, {
    now: () => clock,
    limits: {
      page: { burstMs: 10_000, burstMax: 5, windowMs: 5 * MINUTE, max: 20 },
      search: { burstMs: 10_000, burstMax: 2, windowMs: 5 * MINUTE, max: 6 },
    },
    banLadderMs: [15 * MINUTE, 60 * MINUTE, 360 * MINUTE],
    violationsBeforeBan: 3,
    strikeWindowMs: 10 * MINUTE,
    strikeDecayMs: 24 * 60 * MINUTE,
    ...over,
  });
  return {
    store,
    limiter,
    advance: (ms: number) => {
      clock += ms;
    },
    at: () => clock,
    hit: (surface: SurfaceClass = "page", ipKey = "1.1.1.1", weight = 1) =>
      limiter.check({ ipKey, surface, tier: "none", weight }),
  };
}

// ── Basic windows ───────────────────────────────────────────────────────────

test("requests under the burst limit are allowed", () => {
  const { hit } = harness();
  for (let i = 0; i < 5; i++) assert.equal(hit().action, "allow");
});

test("exceeding the burst limit throttles", () => {
  const { hit } = harness();
  for (let i = 0; i < 5; i++) hit();
  assert.equal(hit().action, "throttle");
});

test("a throttle reports Retry-After in seconds", () => {
  const { hit } = harness();
  for (let i = 0; i < 5; i++) hit();
  const v = hit();
  assert.equal(v.action, "throttle");
  if (v.action === "throttle") assert.equal(v.retryAfterSec, 10);
});

test("the burst window refills once it rolls over", () => {
  const { hit, advance } = harness();
  for (let i = 0; i < 5; i++) hit();
  assert.equal(hit().action, "throttle");
  advance(21_000); // both burst buckets stale
  assert.equal(hit().action, "allow");
});

test("the sustained window trips even when every burst window is respected", () => {
  // This is the patient scraper: paced under the burst limit, still enumerating.
  const { hit, advance } = harness();
  let throttled = false;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < 4; i++) {
      if (hit().action !== "allow") throttled = true;
    }
    advance(21_000);
  }
  assert.equal(throttled, true, "sustained window should have caught the paced scraper");
});

test("surfaces have independent budgets", () => {
  const { hit } = harness();
  for (let i = 0; i < 5; i++) hit("page");
  assert.equal(hit("page").action, "throttle");
  assert.equal(hit("search").action, "allow");
});

test("distinct IPs have independent budgets", () => {
  const { hit } = harness();
  for (let i = 0; i < 5; i++) hit("page", "1.1.1.1");
  assert.equal(hit("page", "1.1.1.1").action, "throttle");
  assert.equal(hit("page", "2.2.2.2").action, "allow");
});

test("the exempt class is never limited", () => {
  const { limiter } = harness();
  for (let i = 0; i < 500; i++) {
    assert.equal(
      limiter.check({ ipKey: "1.1.1.1", surface: "exempt", tier: "none" }).action,
      "allow"
    );
  }
});

// ── Escalation ──────────────────────────────────────────────────────────────

function pushToBan(h: ReturnType<typeof harness>) {
  // 3 violations inside the strike window promotes to a ban.
  let last = h.hit();
  for (let i = 0; i < 40; i++) {
    last = h.hit();
    if (last.action === "ban") return last;
  }
  return last;
}

test("repeated violations promote a throttle into a ban", () => {
  const h = harness();
  const v = pushToBan(h);
  assert.equal(v.action, "ban");
});

test("the ban ladder walks 15 -> 60 -> 360 minutes and then clamps", () => {
  const h = harness();
  const seen: number[] = [];

  for (let round = 0; round < 4; round++) {
    const v = pushToBan(h);
    assert.equal(v.action, "ban");
    if (v.action === "ban") seen.push(v.retryAfterSec);
    // Serve out the ban, then a clean gap so counters reset.
    h.advance(v.action === "ban" ? v.retryAfterSec * 1000 + 1000 : 0);
    h.advance(11 * MINUTE);
  }

  assert.deepEqual(seen, [15 * 60, 60 * 60, 360 * 60, 360 * 60]);
});

test("a request DURING a ban does not extend it", () => {
  // Otherwise a naive client retry loop locks out a whole NAT'd office forever.
  const h = harness();
  const first = pushToBan(h);
  assert.equal(first.action, "ban");
  if (first.action !== "ban") return;

  h.advance(60_000);
  const during = h.hit();
  assert.equal(during.action, "ban");
  if (during.action !== "ban") return;

  // Remaining time must have gone DOWN by the elapsed 60s, not been reset.
  assert.equal(during.retryAfterSec, first.retryAfterSec - 60);
  assert.equal(during.strikes, first.strikes);
});

test("a ban short-circuits BEFORE any counter mutation", () => {
  // The "blocked requests are near-free" contract, asserted directly: while
  // banned, hammering must not touch counter state at all.
  const h = harness();
  assert.equal(pushToBan(h).action, "ban");

  const before = JSON.stringify(h.store.getCounters("1.1.1.1"));
  for (let i = 0; i < 200; i++) h.hit();
  const after = JSON.stringify(h.store.getCounters("1.1.1.1"));

  assert.equal(after, before);
});

test("the ban expires and traffic flows again", () => {
  const h = harness();
  const v = pushToBan(h);
  assert.equal(v.action, "ban");
  if (v.action !== "ban") return;
  h.advance(v.retryAfterSec * 1000 + 1000);
  h.advance(11 * MINUTE);
  assert.equal(h.hit().action, "allow");
});

test("strikes decay after a long clean stretch, resetting the ladder", () => {
  const h = harness();
  const first = pushToBan(h);
  assert.equal(first.action, "ban");
  if (first.action !== "ban") return;

  h.advance(first.retryAfterSec * 1000 + 1000);
  h.advance(25 * 60 * MINUTE); // past strikeDecayMs

  const second = pushToBan(h);
  assert.equal(second.action, "ban");
  if (second.action !== "ban") return;
  assert.equal(second.strikes, 1, "strike count should have decayed to 1");
  assert.equal(second.retryAfterSec, 15 * 60, "ladder should restart at 15 minutes");
});

test("isolated violations spaced apart never accumulate into a ban", () => {
  const h = harness();
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 6; i++) h.hit();
    assert.notEqual(h.hit().action, "ban");
    h.advance(11 * MINUTE);
  }
});

// ── Weighting and crawler tiers ─────────────────────────────────────────────

test("fractional weight lets prefetch bursts through", () => {
  // A category grid fires ~24 RSC prefetches from one human scroll.
  const { hit } = harness();
  for (let i = 0; i < 20; i++) {
    assert.equal(hit("page", "1.1.1.1", 0.25).action, "allow");
  }
});

test("a claimed crawler gets a larger budget", () => {
  const store = createMemoryStore();
  let clock = 1_000_000;
  const limiter = createLimiter(store, {
    now: () => clock,
    limits: { page: { burstMs: 10_000, burstMax: 5, windowMs: 5 * MINUTE, max: 20 } },
  });
  for (let i = 0; i < 25; i++) {
    assert.equal(
      limiter.check({ ipKey: "66.249.66.1", surface: "page", tier: "claimed" }).action,
      "allow"
    );
  }
});

test("a crawler is throttled but NEVER banned", () => {
  // Losing Googlebot costs SEO ranking and the Google Merchant feed.
  const store = createMemoryStore();
  let clock = 1_000_000;
  const limiter = createLimiter(store, {
    now: () => clock,
    limits: { page: { burstMs: 10_000, burstMax: 2, windowMs: 5 * MINUTE, max: 4 } },
    violationsBeforeBan: 2,
  });

  let sawThrottle = false;
  for (let i = 0; i < 500; i++) {
    const v = limiter.check({ ipKey: "66.249.66.1", surface: "page", tier: "claimed" });
    assert.notEqual(v.action, "ban");
    if (v.action === "throttle") sawThrottle = true;
  }
  assert.equal(sawThrottle, true, "crawler should still be throttled");
});

test("a verified bot gets the largest budget of all", () => {
  const store = createMemoryStore();
  const limiter = createLimiter(store, {
    now: () => 1_000_000,
    limits: { page: { burstMs: 10_000, burstMax: 5, windowMs: 5 * MINUTE, max: 20 } },
  });
  for (let i = 0; i < 99; i++) {
    assert.equal(
      limiter.check({ ipKey: "66.249.66.1", surface: "page", tier: "verified" }).action,
      "allow"
    );
  }
});

// ── Credential surface: throttle, never ban ─────────────────────────────────

test("neverBan keeps a repeat offender on throttles instead of a ban", () => {
  const h = harness({ limits: { credential: { burstMs: 10_000, burstMax: 3, windowMs: 5 * MINUTE, max: 10 } } });
  const hitCredential = () =>
    h.limiter.check({ ipKey: "9.9.9.9", surface: "credential", tier: "none", weight: 1, neverBan: true });

  // Far more violations than violationsBeforeBan (3): every one stays a throttle.
  const actions = new Set<string>();
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 6; i++) actions.add(hitCredential().action);
    h.advance(11_000);
  }

  assert.ok(actions.has("throttle"), "expected throttles");
  assert.ok(!actions.has("ban"), "credential traffic must never be banned");
});

test("neverBan traffic ignores a ban the scraping guard already recorded", () => {
  const h = harness({ limits: { credential: { burstMs: 10_000, burstMax: 3, windowMs: 5 * MINUTE, max: 10 } } });
  const ip = "14.201.194.198";

  // The scraping guard banned this IP (it records bans even in GUARD_MODE=log).
  h.store.setBan(ip, { until: h.at() + 24 * 60 * MINUTE, strikes: 4, lastBanAt: h.at() });

  // Ordinary browsing still sees the ban…
  assert.equal(h.limiter.check({ ipKey: ip, surface: "page", tier: "none", weight: 1 }).action, "ban");

  // …but the shopper can still sign in, register, reset a password, check out.
  const credential = h.limiter.check({
    ipKey: ip,
    surface: "credential",
    tier: "none",
    weight: 1,
    neverBan: true,
  });
  assert.equal(credential.action, "allow");
});

test("the same traffic WITHOUT neverBan does escalate to a ban", () => {
  const h = harness({ limits: { credential: { burstMs: 10_000, burstMax: 3, windowMs: 5 * MINUTE, max: 10 } } });
  const hitCredential = () =>
    h.limiter.check({ ipKey: "9.9.9.8", surface: "credential", tier: "none", weight: 1 });

  let sawBan = false;
  for (let round = 0; round < 6 && !sawBan; round++) {
    for (let i = 0; i < 6; i++) if (hitCredential().action === "ban") sawBan = true;
    h.advance(11_000);
  }
  assert.equal(sawBan, true);
});
