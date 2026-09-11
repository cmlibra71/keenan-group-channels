import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SOURCE GUARD — paying an open quote ACCEPTS it, so it reprices first (card gk23c1VK).
 *
 * Chefs Depot member pricing: "a quote reprices on view and on acceptance, with the per-line delta
 * surfaced BEFORE acceptance". The storefront has THREE doors that accept a quote — the emailed
 * link (portal), this site's own Accept (`acceptQuote`), and Pay Now on the quote page
 * (`payQuote`, which accepts via `markAccepted` after building the order). The independent review
 * of 2026-09-11 found Pay Now accepting on unrepriced figures. This pins it:
 *
 *  1. `payQuote` reprices BEFORE it computes what is owed or writes the order, and refuses with
 *     `repriced: true` when a line moved, so nothing is charged on a price the customer has not seen;
 *  2. its `markAccepted` is told the reprice already ran, so the quote cannot be moved away from
 *     the order it has just become;
 *  3. the pay panel re-reads the page on `repriced`, so the per-line change is what they see next.
 *
 * A pure-function test cannot see any of these: each is about ORDER and WIRING in an action.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const payment = strip(readFileSync(path.join(here, "quote-payment.ts"), "utf8"));
const panel = strip(readFileSync(path.join(here, "../../app/account/quotes/[id]/quote-pay-panel.tsx"), "utf8"));

test("payQuote reprices before it prices anything or writes an order, and refuses if a line moved", () => {
  const body = payment.slice(payment.indexOf("export async function payQuote"));
  const reprice = body.indexOf("repriceQuoteForCustomer(");
  assert.ok(reprice > -1, "payQuote must reprice for acceptance");
  assert.ok(reprice < body.indexOf("quoteGstTotals("), "the reprice must come before the amount owed is worked out");
  assert.ok(reprice < body.indexOf("withTransaction("), "the reprice must come before the order is written");
  assert.match(body, /return \{ error: QUOTE_REPRICED_ON_ACCEPT_MESSAGE, repriced: true \}/);
});

test("payQuote's acceptance does not reprice a second time after the order exists", () => {
  assert.match(payment, /markAccepted\(quote\.id, \{ alreadyRepriced: true \}\)/);
});

test("the pay panel re-reads the page when paying was refused for a reprice", () => {
  assert.equal(panel.match(/if \(r\.repriced\) router\.refresh\(\)/g)?.length ?? 0, 2);
});
