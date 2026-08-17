import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Source guard: the checkout PAGE and `placeOrder` must resolve the finance offer
 * for the cart in the SAME state before they count what is payable.
 *
 * Both call `resolvePaymentAvailability(channelCount, offerableCount, signedIn)`,
 * and both counts pass through `filterFinanceMethods(..., financeOffer.eligible)`.
 * If one side resolves the offer only when a finance method already survived the
 * ACCOUNT's filters and the other resolves it unconditionally, the same shopper
 * gets two different answers: on a channel that offers finance, for an account
 * whose allow-list removes it, with a cart over $1,000, the page read
 * "store-unconfigured" (Place Order ENABLED, order booked unpaid) while
 * `placeOrder` read "account-restricted" and refused with PAY_UNAVAILABLE_ACCOUNT_ORDER.
 *
 * That is the "show equals accept" rule (card VAjaPj0t) and the sf-checkout rule
 * "every filter applied on the checkout PAGE is duplicated in `placeOrder`, against
 * the same resolver" (cards LQM9FQYe / N8kE8arY). Unit tests of
 * `resolvePaymentAvailability` cannot see it, because the defect is in the ARGUMENTS
 * each call site computes — so it is guarded at the source, like
 * `customer-payment-list.test.ts`.
 *
 * Drawing the offer is a separate decision and stays conditional: the page renders
 * the finance panel, and provisions the application form, only when a finance method
 * actually survives to this shopper. Only the RESOLUTION must be unconditional.
 */

const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const CALL_SITES = ["app/checkout/page.tsx", "lib/actions/checkout.ts"];

test("both payment-availability call sites resolve the finance offer unconditionally", () => {
  for (const rel of CALL_SITES) {
    const source = readFileSync(path.join(SRC, rel), "utf8");

    // The file really is one of the two call sites (catches a rename/move).
    assert.ok(
      source.includes("resolvePaymentAvailability("),
      `${rel} no longer calls resolvePaymentAvailability — update CALL_SITES in this guard`
    );

    // Strip line comments so prose describing the old shape can't fail the guard.
    const code = source
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");

    // An unconditional assignment: `const <name> = financeOfferForCart({`.
    assert.match(
      code,
      /const\s+\w+\s*=\s*financeOfferForCart\(\{/,
      `${rel} must assign the cart's finance offer unconditionally, so both call sites ` +
        `feed resolvePaymentAvailability the same finance state`
    );

    // …and never a conditional one: `? financeOfferForCart(` or `&& financeOfferForCart(`.
    assert.doesNotMatch(
      code,
      /[?&|]\s*financeOfferForCart\(/,
      `${rel} resolves the finance offer conditionally. The page and placeOrder then ` +
        `count different methods for the same shopper — show no longer equals accept.`
    );

    // The counts must be taken in that same state, not off `!!offer?.eligible`
    // computed from a possibly-null conditional offer.
    assert.doesNotMatch(
      code,
      /filterFinanceMethods\([^)]*!!\s*\w+\?\.eligible/,
      `${rel} counts payment methods off an optional finance offer; resolve the offer ` +
        `unconditionally and pass \`.eligible\` directly`
    );
  }
});
