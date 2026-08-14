import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  readQuoteDeposit,
  normaliseQuoteDeposit,
  resolveQuoteDeposit,
  depositLabel,
  DEFAULT_DEPOSIT_PERCENT,
} from "./quote-deposit";

describe("readQuoteDeposit", () => {
  test("reads a stored percent deposit", () => {
    assert.deepEqual(readQuoteDeposit({ deposit: { mode: "percent", value: "50" } }), {
      mode: "percent",
      value: "50",
    });
  });

  test("reads a stored dollar deposit", () => {
    assert.deepEqual(readQuoteDeposit({ deposit: { mode: "amount", value: "1200.00" } }), {
      mode: "amount",
      value: "1200.00",
    });
  });

  test("every malformed / absent / zero shape reads as no deposit", () => {
    for (const attrs of [
      null,
      undefined,
      {},
      { deposit: null },
      { deposit: "50%" },
      { deposit: { mode: "half", value: "50" } },
      { deposit: { mode: "percent", value: "0" } },
      { deposit: { mode: "percent", value: "-10" } },
      { deposit: { mode: "percent" } },
    ]) {
      assert.equal(readQuoteDeposit(attrs), null);
    }
  });

  test("ignores the other keys the attributes bag carries", () => {
    assert.deepEqual(
      readQuoteDeposit({
        test_mode: true,
        submitted_at: "x",
        deposit: { mode: "percent", value: "25" },
      }),
      { mode: "percent", value: "25" }
    );
  });
});

describe("normaliseQuoteDeposit", () => {
  test("keeps the 50% default as typed", () => {
    assert.deepEqual(normaliseQuoteDeposit("percent", DEFAULT_DEPOSIT_PERCENT), {
      mode: "percent",
      value: "50",
    });
  });

  test("caps a percentage at 100", () => {
    assert.deepEqual(normaliseQuoteDeposit("percent", "150"), { mode: "percent", value: "100" });
  });

  test("stores a dollar deposit at 2dp", () => {
    assert.deepEqual(normaliseQuoteDeposit("amount", "1200"), {
      mode: "amount",
      value: "1200.00",
    });
  });

  test("clears on anything at or below zero, or an unknown mode", () => {
    assert.equal(normaliseQuoteDeposit("percent", "0"), null);
    assert.equal(normaliseQuoteDeposit("amount", "-5"), null);
    assert.equal(normaliseQuoteDeposit(null, "50"), null);
    assert.equal(normaliseQuoteDeposit("fraction", "50"), null);
  });
});

describe("resolveQuoteDeposit", () => {
  test("halves a GST-INCLUSIVE total at 50%", () => {
    assert.deepEqual(resolveQuoteDeposit({ mode: "percent", value: "50" }, "67.10"), {
      mode: "percent",
      percent: 50,
      due_now: 33.55,
      balance: 33.55,
      total_inc: 67.1,
    });
  });

  test("the deposit and the balance always add back to the total", () => {
    const r = resolveQuoteDeposit({ mode: "percent", value: "30" }, "100.05")!;
    assert.equal(r.due_now, 30.02);
    assert.equal(r.balance, 70.03);
    assert.ok(Math.abs(r.due_now + r.balance - 100.05) < 0.005);
  });

  test("takes a dollar deposit as inc-GST dollars", () => {
    assert.deepEqual(resolveQuoteDeposit({ mode: "amount", value: "1000.00" }, "5500.00"), {
      mode: "amount",
      percent: null,
      due_now: 1000,
      balance: 4500,
      total_inc: 5500,
    });
  });

  test("never asks for more than the total", () => {
    // A rep's $5,000 deposit on a quote later cut to $1,200 must not overcharge.
    assert.equal(resolveQuoteDeposit({ mode: "amount", value: "5000.00" }, "1200.00"), null);
  });

  test("is nothing when the deposit covers the whole quote, or there is no money", () => {
    assert.equal(resolveQuoteDeposit({ mode: "percent", value: "100" }, "500.00"), null);
    assert.equal(resolveQuoteDeposit(null, "500.00"), null);
    assert.equal(resolveQuoteDeposit({ mode: "percent", value: "50" }, "0"), null);
    assert.equal(resolveQuoteDeposit({ mode: "percent", value: "50" }, "not money"), null);
  });
});

describe("depositLabel", () => {
  test("names the percentage when there is one", () => {
    assert.equal(
      depositLabel(resolveQuoteDeposit({ mode: "percent", value: "50" }, "100")!),
      "Deposit due now (50%)"
    );
  });

  test("stays plain on a dollar deposit", () => {
    assert.equal(
      depositLabel(resolveQuoteDeposit({ mode: "amount", value: "40" }, "100")!),
      "Deposit due now"
    );
  });
});
