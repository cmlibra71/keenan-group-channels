// Cart → checkout as a (non-member) logged-in customer. Adds a priced product,
// then places an order via a no-Stripe method (bank transfer / net terms) so no
// card is charged. If Stripe is the only method and a testMode gateway is
// configured, fills the 4242 test card; otherwise the Stripe path is skipped.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";
import { addPricedProductToCart } from "../lib/site.mjs";

export const meta = { name: "checkout", writes: true };

async function ensureLoggedIn(ctx) {
  const { page, base, secret, account } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});
}

/** Best-effort fill of a Stripe single-card Element across its iframes. */
async function fillStripeCard(page) {
  const frame = page.frameLocator("iframe[name^='__privateStripeFrame'], iframe[title*='payment']").first();
  await frame.locator("[name='cardnumber'], [placeholder*='Card number']").first().fill("4242424242424242", { timeout: 5000 });
  await frame.locator("[name='exp-date'], [placeholder*='MM']").first().fill("12 34", { timeout: 5000 });
  await frame.locator("[name='cvc'], [placeholder*='CVC']").first().fill("123", { timeout: 5000 });
  await frame.locator("[name='postal'], [placeholder*='ZIP'], [placeholder*='postcode']").first().fill("3000", { timeout: 2000 }).catch(() => {});
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
    const empty = await page.locator("text=/your cart is empty/i").first().isVisible().catch(() => false);
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

    // New-address form (shown when there are no saved addresses).
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
    } else if (methods.includes("stripe")) {
      await page.locator("input[name='paymentMethod'][value='stripe']").check().catch(() => {});
      usedStripe = true;
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
    const orderParam = new URL(page.url()).searchParams.get("order");
    s.note(`order confirmed: ${orderParam || "(no order param)"}`);
  });

  await report.step({ flow: "checkout", name: "confirmation page", route: "/checkout/confirmation" }, async (s) => {
    if (!/\/checkout\/confirmation/.test(page.url())) return s.warn("not on confirmation page (order may not have been placed)");
    const hasThanks = await page.locator("text=/order|thank|confirm/i").first().isVisible().catch(() => false);
    assert(hasThanks, "confirmation page missing order/thank-you copy");
  });
}
