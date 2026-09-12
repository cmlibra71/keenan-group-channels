import { describe, it } from "node:test";
import assert from "node:assert";
import {
  CART_RESTRICTED_ERROR,
  cartLineNotice,
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

describe("cartLineNotice — what ONE cart line says under its name", () => {
  it("says nothing on an ordinary line nobody has been refused on", () => {
    assert.equal(cartLineNotice(null, false), null);
    assert.equal(cartLineNotice(undefined, false), null);
    assert.equal(cartLineNotice("", false), null);
    assert.equal(cartLineNotice("   ", false), null);
  });

  it("a restricted line explains itself BEFORE it is touched", () => {
    assert.equal(cartLineNotice(null, true), CART_RESTRICTED_ERROR);
    assert.equal(cartLineNotice("", true), CART_RESTRICTED_ERROR);
  });

  it("what the SERVER said about the last change wins over the standing reason", () => {
    // Review 2026-09-12: a restricted line can still be refused for some OTHER
    // reason. Answering that with the standing sentence tells the shopper the
    // wrong thing about the press they just made.
    const other = "Please open the product page and fill in Instructions before adding this.";
    assert.equal(cartLineNotice(other, true), other);
    assert.equal(cartLineNotice(other, false), other);
  });

  it("an unrestricted line still reports its refusal — no press is ever silent", () => {
    assert.equal(cartLineNotice("Only 2 left.", false), "Only 2 left.");
  });
});
