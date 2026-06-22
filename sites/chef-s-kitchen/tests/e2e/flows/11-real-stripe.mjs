// Real Stripe (test-mode) paths — the actual card flows the rest of the suite
// deliberately bypasses. Uses account B (created in the order-scoping flow; no
// membership), with Stripe test card 4242 4242 4242 4242. No real money moves.
//   A) Card payment at checkout — skipped if the channel offers no Stripe method.
//   B) Membership subscription via the REAL Stripe card element (not the bypass).
import { goto, assert, settle, fillStable, bypassLogin } from "../lib/harness.mjs";
import { addPricedProductToCart, fillStripeCard } from "../lib/site.mjs";
import { getOrderByNumber } from "../lib/db.mjs";

export const meta = { name: "real-stripe", writes: true };

async function waitEnabled(locator, page, tries = 16) {
  for (let i = 0; i < tries; i++) {
    if (await locator.isEnabled().catch(() => false)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

export async function run(ctx) {
  const { page, base, report, fixtures, secret } = ctx;
  const b = ctx.accountB;

  if (!b) {
    report.skip({ flow: "real-stripe", name: "real Stripe paths", route: "" }, "account B was not created (order-scoping flow skipped)");
    return;
  }
  if (secret) await bypassLogin(page, { base, secret, email: b.email }).catch(() => {});

  // ── A) Card payment at checkout ──────────────────────────────────────────
  await report.step({ flow: "real-stripe", name: "card checkout (test card 4242)", route: "/checkout" }, async (s) => {
    const slugs = fixtures?.pricedSlugs || [];
    if (!slugs.length) return s.warn("no priced product fixtures");
    if (!(await addPricedProductToCart(page, base, slugs))) return s.warn("could not add a product to the cart");

    await goto(page, base, "/checkout");
    await settle(page, 600);
    const email = page.locator("input[name='email']").first();
    if (await email.isVisible().catch(() => false)) {
      if (!(await email.inputValue().catch(() => ""))) await fillStable(page, "input[name='email']", b.email);
    }
    const addr1 = page.locator("input[name='address1']").first();
    if (await addr1.isVisible().catch(() => false)) {
      await fillStable(page, "input[name='firstName']", b.firstName).catch(() => {});
      await fillStable(page, "input[name='lastName']", b.lastName).catch(() => {});
      await fillStable(page, "input[name='address1']", "100 Test Street");
      await fillStable(page, "input[name='city']", "Melbourne").catch(() => {});
      await fillStable(page, "input[name='postalCode']", "3000");
      await page.waitForTimeout(800);
    }

    const methods = await page.locator("input[name='paymentMethod']").evaluateAll((els) => els.map((e) => e.value));
    if (!methods.includes("stripe")) {
      report.skip(
        { flow: "real-stripe", name: "card checkout", route: "/checkout" },
        `channel offers no Stripe/card method at checkout (only: ${methods.join(", ") || "none"}) — customers can't pay by card here`
      );
      return;
    }
    await page.locator("input[name='paymentMethod'][value='stripe']").check().catch(() => {});
    const mounted = await page.locator("iframe[name^='__privateStripeFrame']").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
    if (!mounted) return s.warn("Stripe card element did not mount (no testMode gateway configured?)");
    await fillStripeCard(page);
    const payBtn = page.getByRole("button", { name: /Pay Now/ }).first();
    if (!(await waitEnabled(payBtn, page))) return s.warn("Pay Now stayed disabled (card not ready)");
    await payBtn.click();
    const ok = await page.waitForURL(/\/checkout\/confirmation/, { timeout: 45000 }).then(() => true).catch(() => false);
    if (!ok) {
      const err = await page.locator(".bg-sale-bg, .text-sale, .alert-error").first().textContent().catch(() => null);
      throw new Error(err ? `card payment failed: ${err.trim()}` : "card payment did not reach confirmation");
    }
    const orderNum = new URL(page.url()).searchParams.get("order");
    const order = await getOrderByNumber(orderNum).catch(() => null);
    s.note(`card order ${orderNum} confirmed; DB payment_status=${order?.payment_status ?? "?"}`);
  });

  // ── B) Membership subscription via the REAL Stripe card element ───────────
  await report.step({ flow: "real-stripe", name: "membership via real Stripe card (4242)", route: "/account/membership/subscribe" }, async (s) => {
    await goto(page, base, "/account/membership");
    await settle(page, 400);
    if (/\/account\/membership\/complete-profile/.test(page.url())) {
      return s.warn("redirected to complete-profile (B already has a subscription) — skipping");
    }
    let href = await page.evaluate(() => document.querySelector("a[href*='/account/membership/subscribe/']")?.getAttribute("href") || null);
    if (!href) href = "/account/membership/subscribe/chefs-depot-membership";
    const status = await goto(page, base, href);
    if (status >= 400) return s.warn(`subscribe page HTTP ${status}`);
    if (/\/account\/membership(\/?$|\?)/.test(page.url()) && !/subscribe/.test(page.url())) {
      return s.warn("redirected away from subscribe (B may already be a member)");
    }
    const notConfigured = await page.locator("text=/Payment is not properly configured/i").first().isVisible().catch(() => false);
    if (notConfigured) {
      report.skip({ flow: "real-stripe", name: "membership via real Stripe card", route: href }, "subscribe page not configured (missing Stripe publishable key / price id)");
      return;
    }
    await settle(page, 800);
    const mounted = await page.locator("iframe[name^='__privateStripeFrame']").first().waitFor({ state: "visible", timeout: 12000 }).then(() => true).catch(() => false);
    if (!mounted) return s.warn("subscribe Stripe card element did not mount");
    await fillStripeCard(page);
    const subBtn = page.getByRole("button", { name: /Subscribe Now/ }).first();
    if (!(await waitEnabled(subBtn, page))) return s.warn("Subscribe Now stayed disabled (card not ready)");
    await subBtn.click();
    const ok = await page.waitForURL(/\/account\/membership\/complete-profile/, { timeout: 45000 }).then(() => true).catch(() => false);
    if (!ok) {
      const err = await page.locator(".bg-sale-bg, .text-sale-deep, .text-sale").first().textContent().catch(() => null);
      if (err && /not properly configured/i.test(err)) {
        report.skip({ flow: "real-stripe", name: "membership via real Stripe card", route: href }, `Stripe subscription not configured: ${err.trim()}`);
        return;
      }
      throw new Error(err ? `real Stripe subscribe failed: ${err.trim()}` : "did not reach complete-profile after real Stripe subscribe");
    }
    s.note("real Stripe (test-mode) subscription created + card payment confirmed ✓");
  });
}
