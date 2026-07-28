// Cart → checkout as a (non-member) logged-in customer. Adds a priced product,
// then places an order via a no-Stripe method (bank transfer / net terms) so no
// card is charged. Verifies the confirmation content, the bank-transfer details,
// and the persisted order status in the DB. Records the order number on ctx so
// the order-scoping flow can reuse it.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";
import { addPricedProductToCart, fillStripeCard } from "../lib/site.mjs";
import { getOrderByNumber } from "../lib/db.mjs";

export const meta = { name: "checkout", writes: true };

async function ensureLoggedIn(ctx) {
  const { page, base, secret, account } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});
}

export async function run(ctx) {
  const { page, base, report, fixtures } = ctx;
  await ensureLoggedIn(ctx);

  // 1. Add a priced, in-stock product (verified via the /cart page).
  let addedSlug = null;
  await report.step({ flow: "checkout", name: "add product to cart", route: "/products/[slug]" }, async (s) => {
    const slugs = fixtures?.pricedSlugs || [];
    assert(slugs.length, "no priced product fixtures discovered");
    addedSlug = await addPricedProductToCart(page, base, slugs);
    assert(addedSlug, "could not add any priced product to the cart");
    s.note(`added ${addedSlug}`);
  });

  // 2. Cart page shows the line.
  await report.step({ flow: "checkout", name: "cart shows item", route: "/cart" }, async (s) => {
    const status = await goto(page, base, "/cart");
    assert(status < 400, `HTTP ${status}`);
    // Scope to <main>: the header cart slide-out stays mounted when closed (see
    // isLoggedOut in lib/site.mjs), and its "Your cart is empty" copy is present
    // — and counts as visible — on EVERY page, so an unscoped check always fails.
    const empty = await page
      .locator("main")
      .locator("text=/your cart is empty/i")
      .first()
      .isVisible()
      .catch(() => false);
    assert(!empty, "cart reported empty after add-to-cart");
  });

  // 3. Checkout: fill contact/address, pick a no-Stripe method, place order.
  await report.step({ flow: "checkout", name: "place order", route: "/checkout" }, async (s) => {
    const status = await goto(page, base, "/checkout");
    assert(status < 400, `HTTP ${status}`);
    await settle(page, 600);

    const email = page.locator("input[name='email']").first();
    if (await email.isVisible().catch(() => false)) {
      const val = await email.inputValue().catch(() => "");
      if (!val) await fillStable(page, "input[name='email']", ctx.account.email);
    }

    const addr1 = page.locator("input[name='address1']").first();
    if (await addr1.isVisible().catch(() => false)) {
      await fillStable(page, "input[name='firstName']", ctx.account.firstName).catch(() => {});
      await fillStable(page, "input[name='lastName']", ctx.account.lastName).catch(() => {});
      await fillStable(page, "input[name='address1']", "100 Test Street");
      await fillStable(page, "input[name='city']", "Melbourne").catch(() => {});
      await fillStable(page, "input[name='state']", "VIC").catch(() => {});
      await fillStable(page, "input[name='postalCode']", "3000");
      await page.waitForTimeout(900); // allow shipping calc debounce
    }

    const methods = await page.locator("input[name='paymentMethod']").evaluateAll((els) => els.map((e) => e.value));
    s.note(`payment methods offered: ${methods.join(", ") || "(none)"}`);
    let usedStripe = false;
    const pick = ["bank_transfer", "net_terms"].find((m) => methods.includes(m));
    if (pick) {
      await page.locator(`input[name='paymentMethod'][value='${pick}']`).check().catch(() => {});
      ctx.lastPaymentMethod = pick;
    } else if (methods.includes("stripe")) {
      await page.locator("input[name='paymentMethod'][value='stripe']").check().catch(() => {});
      usedStripe = true;
      ctx.lastPaymentMethod = "stripe";
    } else {
      ctx.lastPaymentMethod = "";
    }

    if (usedStripe) {
      const cardMounted = await page.locator("iframe[name^='__privateStripeFrame']").first().isVisible().catch(() => false);
      if (!cardMounted) {
        report.skip({ flow: "checkout", name: "stripe payment", route: "/checkout" }, "Stripe selected but no card element (no testMode gateway)");
        s.warn("only Stripe offered and no testMode gateway — order not placed");
        return;
      }
      await fillStripeCard(page).catch(() => {});
    }

    const submit = page.getByRole("button", { name: /Place Order|Pay Now/ }).first();
    assert(await submit.isVisible().catch(() => false), "no Place Order / Pay Now button");
    await submit.click();

    const ok = await page.waitForURL(/\/checkout\/confirmation/, { timeout: 45000 }).then(() => true).catch(() => false);
    if (!ok) {
      const err = await page.locator(".bg-sale-bg, .alert-error").first().textContent().catch(() => null);
      throw new Error(err ? `order not confirmed: ${err.trim()}` : "did not reach /checkout/confirmation");
    }
    ctx.lastOrderNumber = new URL(page.url()).searchParams.get("order");
    s.note(`order confirmed: ${ctx.lastOrderNumber || "(no order param)"} via ${ctx.lastPaymentMethod || "(no method)"}`);
  });

  await report.step({ flow: "checkout", name: "confirmation content", route: "/checkout/confirmation" }, async (s) => {
    if (!/\/checkout\/confirmation/.test(page.url())) return s.warn("not on confirmation page (order may not have been placed)");
    const body = (await page.locator("main").innerText().catch(() => "")) || "";
    assert(/order|thank|confirm/i.test(body), "confirmation page missing order/thank-you copy");
    if (ctx.lastPaymentMethod === "bank_transfer") {
      assert(/Bank Transfer Details/i.test(body), "bank-transfer order missing 'Bank Transfer Details' panel");
      if (ctx.lastOrderNumber) {
        assert(body.includes(ctx.lastOrderNumber), "confirmation does not show the order number as the payment reference");
      }
      // CD has no bank account configured yet → the fallback copy is expected for now.
      if (/contact us for our bank account details/i.test(body)) {
        s.warn("bank-transfer order placed but NO bank account details are configured for this channel (fallback shown) — fill them in the portal Checkout tab");
      } else {
        s.note("configured bank account details are displayed");
      }
    }
  });

  // 4. The order persisted with the correct status (source of truth: the DB).
  await report.step({ flow: "checkout", name: "order persisted with correct status (DB)", route: "/checkout" }, async (s) => {
    if (!ctx.lastOrderNumber) return s.warn("no order number captured — skipping DB check");
    const order = await getOrderByNumber(ctx.lastOrderNumber).catch(() => null);
    assert(order, `order ${ctx.lastOrderNumber} not found in the DB`);
    s.note(`DB: status=${order.status}, payment_status=${order.payment_status}, method=${order.payment_method}`);
    const expected = {
      bank_transfer: ["pending_payment"],
      net_terms: ["net_terms"],
      stripe: ["awaiting_payment", "paid"],
    }[ctx.lastPaymentMethod] || null;
    if (expected) {
      assert(
        expected.includes(order.payment_status),
        `payment_status="${order.payment_status}" — expected one of ${expected.join("/")} for ${ctx.lastPaymentMethod}`
      );
    }
  });
}
