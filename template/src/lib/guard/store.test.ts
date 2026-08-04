import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore, getSharedStore, type Counters } from "./store.ts";

function counters(at: number): Counters {
  return { lastSeen: at, burst: {}, window: {}, violations: 0, firstViolationAt: 0 };
}

test("counters round-trip", () => {
  const store = createMemoryStore();
  store.setCounters("a", counters(1));
  assert.equal(store.getCounters("a")?.lastSeen, 1);
  assert.equal(store.getCounters("missing"), undefined);
});

test("bans round-trip and can be cleared", () => {
  const store = createMemoryStore();
  store.setBan("a", { until: 500, strikes: 2, lastBanAt: 100 });
  assert.equal(store.getBan("a")?.strikes, 2);
  store.clearBan("a");
  assert.equal(store.getBan("a"), undefined);
});

test("the counters map is capped", () => {
  const store = createMemoryStore({ maxCounters: 100 });
  for (let i = 0; i < 1000; i++) store.setCounters(`ip-${i}`, counters(i));
  assert.equal(store.sizes().counters, 100);
});

test("eviction is LRU — the least recently TOUCHED key goes first", () => {
  const store = createMemoryStore({ maxCounters: 3 });
  store.setCounters("a", counters(1));
  store.setCounters("b", counters(2));
  store.setCounters("c", counters(3));

  // Touch "a" so it is no longer the oldest.
  store.setCounters("a", counters(4));
  store.setCounters("d", counters(5));

  assert.ok(store.getCounters("a"), "recently touched key survived");
  assert.equal(store.getCounters("b"), undefined, "least recently used was evicted");
  assert.ok(store.getCounters("c"));
  assert.ok(store.getCounters("d"));
});

test("REGRESSION: bans survive a distributed flood of 100k counter keys", () => {
  // The limiter this replaces (lib/rate-limit.ts) calls hits.clear() once its
  // single map passes 5,000 entries — so a scrape from many addresses disarmed
  // it at exactly the moment it mattered. Bans must be untouchable by counter
  // churn.
  const store = createMemoryStore({ maxCounters: 20_000, maxBans: 5_000 });
  store.setBan("attacker", { until: 9_999_999, strikes: 3, lastBanAt: 1 });

  for (let i = 0; i < 100_000; i++) store.setCounters(`flood-${i}`, counters(i));

  const ban = store.getBan("attacker");
  assert.ok(ban, "the ban must still be there after the flood");
  assert.equal(ban?.strikes, 3);
  assert.equal(store.sizes().counters, 20_000, "counters respected their own cap");
});

test("the bans map is capped independently", () => {
  const store = createMemoryStore({ maxCounters: 10, maxBans: 50 });
  for (let i = 0; i < 500; i++) {
    store.setBan(`ip-${i}`, { until: 1, strikes: 1, lastBanAt: 1 });
  }
  assert.equal(store.sizes().bans, 50);
});

test("a flood of counters does not evict bans even when the ban cap is small", () => {
  const store = createMemoryStore({ maxCounters: 10, maxBans: 2 });
  store.setBan("x", { until: 1, strikes: 1, lastBanAt: 1 });
  for (let i = 0; i < 5000; i++) store.setCounters(`f-${i}`, counters(i));
  assert.ok(store.getBan("x"));
});

test("getSharedStore returns the SAME object across calls", () => {
  // Load-bearing: proxy.ts and the route handlers are separate bundles in one
  // process, so a plain module const would silently split every counter in two.
  assert.equal(getSharedStore(), getSharedStore());
});

test("the shared store is reachable through the global symbol registry", () => {
  const store = getSharedStore();
  store.setBan("probe", { until: 42, strikes: 1, lastBanAt: 1 });

  // Simulate the other bundle resolving the same registered symbol.
  const viaRegistry = (globalThis as Record<symbol, unknown>)[
    Symbol.for("keenan.guard.store.v1")
  ] as typeof store;

  assert.equal(viaRegistry.getBan("probe")?.until, 42);
  viaRegistry.clearBan("probe");
});
