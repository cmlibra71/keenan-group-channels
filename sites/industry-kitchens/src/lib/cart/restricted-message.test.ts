import { describe, it } from "node:test";
import assert from "node:assert";
import {
  CART_RESTRICTED_ERROR,
  restrictedCheckoutMessage,
  quantityRefusedCheckoutMessage,
} from "./restricted-message";

// ============================================================================
// Card 1sgz4B3v — the two sf-cart / sf-checkout preconditions the quote-only
// write waits on. Both are about WORDING a shopper reads, so both are asserted
// verbatim: the drawer must say something when a "+" is refused, and Place Order
// must say WHICH line it refused.
// ============================================================================

describe("the cart refusal a shopper reads", () => {
  it("is one sentence, shared by the server action and the cart row", () => {
    assert.equal(
      CART_RESTRICTED_ERROR,
      "This product isn't available to order online — please add it to a quote."
    );
  });

  it("tells the shopper what to do instead — there is no other wording left to explain it", () => {
    assert.match(CART_RESTRICTED_ERROR, /add it to a quote/);
  });
});

describe("Place Order names the line it refused", () => {
  it("a restricted product is named, and the shopper is told how to act on it", () => {
    const msg = restrictedCheckoutMessage("Mazzer Kony Electronic Coffee Grinder");
    assert.match(msg, /^Mazzer Kony Electronic Coffee Grinder /);
    assert.match(msg, /isn't available to order online/);
    assert.match(msg, /remove it from your cart/);
    assert.match(msg, /ask us for a quote/);
    // Never "at that quantity": no quantity of a restricted product is orderable.
    assert.ok(!/at that quantity/.test(msg));
  });

  it("a product short of stock is named too, and reads about the QUANTITY", () => {
    const msg = quantityRefusedCheckoutMessage("Dudson Evolution Plate");
    assert.match(msg, /^Dudson Evolution Plate /);
    assert.match(msg, /quantity/);
    assert.match(msg, /ask us for a quote/);
  });

  it("falls back to the un-named sentence rather than an empty quote", () => {
    for (const missing of [null, undefined, "", "   "]) {
      assert.match(restrictedCheckoutMessage(missing), /^One of the items in your cart /);
      assert.match(quantityRefusedCheckoutMessage(missing), /^One of the items in your cart /);
    }
  });

  it("the two refusals are distinguishable — a shopper is never told to reduce what they cannot buy at all", () => {
    assert.notEqual(
      restrictedCheckoutMessage("Widget"),
      quantityRefusedCheckoutMessage("Widget")
    );
  });
});
