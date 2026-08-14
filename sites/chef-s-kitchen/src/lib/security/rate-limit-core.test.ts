import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMIT_POLICIES,
  consumeRateLimit,
  noteRateLimitFailure,
  resetRateLimitState,
} from "./rate-limit-core.ts";

const MINUTE = 60_000;

describe("storefront rate-limit rulebook", () => {
  beforeEach(() => resetRateLimitState());

  test("allows up to the per-IP limit, then rejects with a wait", () => {
    const t0 = 1_000_000;
    const max = RATE_LIMIT_POLICIES.registration.buckets[0].max;

    for (let i = 0; i < max; i++) {
      assert.equal(consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + i).allowed, true);
    }

    const blocked = consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + max);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.scope, "ip");
    assert.ok(blocked.retryAfter > 0);
    assert.match(blocked.message, /too many/i);
  });

  test("budgets are per IP", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 10; i++) consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + i);
    assert.equal(consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + 20).allowed, false);
    assert.equal(consumeRateLimit("registration", { ip: "2.2.2.2" }, t0 + 20).allowed, true);
  });

  test("the window rolls forward", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 10; i++) consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + i);
    assert.equal(consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + MINUTE).allowed, false);
    assert.equal(
      consumeRateLimit("registration", { ip: "1.1.1.1" }, t0 + 15 * MINUTE + 1).allowed,
      true
    );
  });

  test("a distributed run at ONE account is capped by the account bucket", () => {
    const t0 = 4_000_000;
    const max = RATE_LIMIT_POLICIES.password_reset_request.buckets[1].max;

    for (let i = 0; i < max; i++) {
      const r = consumeRateLimit(
        "password_reset_request",
        { ip: `10.0.0.${i}`, identifier: "shopper@example.com" },
        t0 + i
      );
      assert.equal(r.allowed, true);
    }

    const blocked = consumeRateLimit(
      "password_reset_request",
      { ip: "10.0.0.200", identifier: "shopper@example.com" },
      t0 + max
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.scope, "account");
  });

  test("a customer who signs in successfully is never locked out", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 100; i++) {
      const r = consumeRateLimit(
        "sign_in",
        { ip: `10.1.0.${i % 200}`, identifier: "regular@example.com" },
        t0 + i
      );
      assert.equal(r.allowed, true);
    }
  });

  test("repeated WRONG passwords lock the account bucket", () => {
    const t0 = 6_000_000;
    const subject = { ip: "10.2.0.1", identifier: "regular@example.com" };
    const max = RATE_LIMIT_POLICIES.sign_in.buckets[1].max;

    for (let i = 0; i < max; i++) {
      assert.equal(consumeRateLimit("sign_in", subject, t0 + i).allowed, true);
      noteRateLimitFailure("sign_in", subject, t0 + i);
    }

    const blocked = consumeRateLimit(
      "sign_in",
      { ip: "10.2.0.2", identifier: "regular@example.com" },
      t0 + max
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.scope, "account");
  });

  test("emails are matched case-insensitively", () => {
    const t0 = 7_000_000;
    for (let i = 0; i < 5; i++) {
      consumeRateLimit("password_reset_request", { ip: `10.3.0.${i}`, identifier: "Sam@X.com" }, t0 + i);
    }
    assert.equal(
      consumeRateLimit("password_reset_request", { ip: "10.3.0.9", identifier: "sam@x.com" }, t0 + 9)
        .allowed,
      false
    );
  });

  test("a guest checkout is limited by IP alone and still gets a generous budget", () => {
    const t0 = 8_000_000;
    for (let i = 0; i < 60; i++) {
      assert.equal(consumeRateLimit("checkout", { ip: "10.4.0.1" }, t0 + i).allowed, true);
    }
    assert.equal(consumeRateLimit("checkout", { ip: "10.4.0.1" }, t0 + 61).allowed, false);
  });

  test("audit fires once per bucket per window", () => {
    const t0 = 9_000_000;
    for (let i = 0; i < 10; i++) consumeRateLimit("registration", { ip: "10.5.0.1" }, t0 + i);

    assert.equal(consumeRateLimit("registration", { ip: "10.5.0.1" }, t0 + 100).audit, true);
    assert.equal(consumeRateLimit("registration", { ip: "10.5.0.1" }, t0 + 200).audit, false);
    assert.equal(consumeRateLimit("registration", { ip: "10.5.0.1" }, t0 + 300).audit, false);
  });

  test("a rejected request does not charge the other dimension", () => {
    const t0 = 10_000_000;
    // Fill the per-IP bucket for registration (10), leaving the account bucket at 5.
    for (let i = 0; i < 10; i++) {
      consumeRateLimit("registration", { ip: "10.6.0.1", identifier: "a@x.com" }, t0 + i);
    }
    for (let i = 0; i < 20; i++) {
      consumeRateLimit("registration", { ip: "10.6.0.1", identifier: "a@x.com" }, t0 + 100 + i);
    }
    // The account bucket saw exactly the 5 allowed hits before it filled, never
    // the 20 rejected ones — so a different IP is refused on the ACCOUNT bucket.
    const other = consumeRateLimit("registration", { ip: "10.6.0.9", identifier: "a@x.com" }, t0 + 500);
    assert.equal(other.allowed, false);
    assert.equal(other.scope, "account");
  });

  test("a customer's whole office can sign in from one address", () => {
    const t0 = 20_000_000;
    for (let i = 0; i < 40; i++) {
      const decision = consumeRateLimit("sign_in", { ip: "203.0.113.7", identifier: `buyer${i}@trade.com.au` }, t0 + i);
      assert.equal(decision.allowed, true, `sign-in ${i} was refused`);
    }
  });

  test("wrong passwords from that address are still capped", () => {
    const t0 = 21_000_000;
    const max = RATE_LIMIT_POLICIES.sign_in.buckets[0].max;
    for (let i = 0; i < max; i++) {
      noteRateLimitFailure("sign_in", { ip: "203.0.113.8", identifier: `victim${i}@x.com` }, t0 + i);
    }
    const blocked = consumeRateLimit("sign_in", { ip: "203.0.113.8", identifier: "victim999@x.com" }, t0 + max);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.scope, "ip");
  });

  test("the address typeahead has a budget of its own", () => {
    const t0 = 22_000_000;
    // Typing two full addresses is a handful of settles; 100 is far past that.
    for (let i = 0; i < 100; i++) {
      assert.equal(consumeRateLimit("address_lookup", { ip: "203.0.113.9" }, t0 + i).allowed, true);
    }
  });

  test("every policy is well formed", () => {
    for (const [name, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
      assert.ok(policy.buckets.length > 0, `${name} has no buckets`);
      assert.ok(policy.message.length > 0, `${name} has no message`);
      for (const bucket of policy.buckets) {
        assert.ok(bucket.max > 0);
        assert.ok(bucket.windowMs > 0);
        assert.ok(bucket.scope === "ip" || bucket.scope === "account");
      }
    }
  });
});
