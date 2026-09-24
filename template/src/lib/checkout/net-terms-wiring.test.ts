import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD — the storefront never writes an order on Net Terms for a shopper it has not
 * approved (card lKwmp35D).
 *
 * Chefs Depot order ORD-MPW1ZRXW-V4TN was written on Net Terms on 2 June 2026 for a shopper with
 * no account at all. Both storefront writers refuse that today: `placeOrder` and the account
 * area's quote payment each resolve the shopper's entitlement with `resolveNetTermsEntitlement`
 * (the account's net-terms flag and a term, `resolveNetTermsForContact` in @keenan/services) and
 * refuse Net Terms without one. What a unit test of the resolver cannot see is WHERE each writer
 * makes that call — a refusal placed after `orderService.create` refuses nothing — so this pins the
 * order of the two, the same shape as guest-contact-wiring.test.ts.
 *
 * The portal's staff and REST writers carry the same rule (`assertNetTermsEntitled`), and the
 * portal's `net_terms_without_entitlement` data contract notices the day any of them stops.
 */
const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

function at(source: string, needle: string, from = 0): number {
  const i = source.indexOf(needle, from);
  assert.notEqual(i, -1, `"${needle}" not found — this guard needs rewriting`);
  return i;
}

test("placeOrder refuses Net Terms without an entitlement BEFORE it writes the order", () => {
  const source = read("lib/actions/checkout.ts");
  const fn = at(source, "export async function placeOrder(");
  const resolve = at(source, "await resolveNetTermsEntitlement(session)", fn);
  const refuse = at(source, 'if (paymentMethod === "net_terms" && !netTerms) {', resolve);
  const write = at(source, "await orderService.create(", fn);
  assert.ok(resolve < refuse, "the refusal must test the entitlement this call resolved");
  assert.ok(refuse < write, "Net Terms must be refused before the order row is written");
  // The refusal RETURNS — it is not a warning that carries on to the write.
  assert.match(source.slice(refuse, refuse + 200), /return \{ error:/);
});

test("placeOrder records the term and the account only from the entitlement it checked", () => {
  const source = read("lib/actions/checkout.ts");
  assert.ok(
    source.includes('if (effectivePaymentMethod === "net_terms" && netTerms) orderMetafields.net_terms_days'),
    "the term stamped on a net-terms order must come from the resolved entitlement"
  );
});

test("the checkout page offers Net Terms only to an entitled shopper — what we show is what we accept", () => {
  const source = read("app/checkout/page.tsx");
  at(source, "resolveNetTermsEntitlement(session)");
  at(source, '.filter((m) => m.id !== "net_terms" || !!netTerms)');
});

test("quote payment drops Net Terms for an unentitled shopper and refuses a posted one BEFORE writing the order", () => {
  const source = read("lib/actions/quote-payment.ts");
  const fn = at(source, "export async function payQuote(");
  const resolve = at(source, "resolveNetTermsEntitlement(session)", fn);
  const filter = at(source, '.filter((m) => m.id !== "net_terms" || !!netTerms)', resolve);
  const refuse = at(source, "!methods.some((m) => m.id === paymentMethod)", filter);
  const write = at(source, "await orderService.create(", fn);
  assert.ok(resolve < filter && filter < refuse, "the refusal must read the entitlement-filtered list");
  assert.ok(refuse < write, "a posted Net Terms must be refused before the order row is written");
});
