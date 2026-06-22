// Become a member via the staff/QA test card (no Stripe charge), complete the
// required business profile, and confirm active membership. Sets ctx.isMember
// so later flows know whether member-only paths are reachable.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";

export const meta = { name: "membership", writes: true };

export async function run(ctx) {
  const { page, base, report, secret, account, testCard } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});

  await report.step({ flow: "membership", name: "membership landing", route: "/membership" }, async (s) => {
    const status = await goto(page, base, "/membership");
    assert(status < 400, `HTTP ${status}`);
  });

  // Find the subscribe link (plan slug) from the membership dashboard.
  let subscribeHref = null;
  await report.step({ flow: "membership", name: "open subscribe page", route: "/account/membership" }, async (s) => {
    await goto(page, base, "/account/membership");
    subscribeHref = await page.evaluate(
      () => document.querySelector("a[href*='/account/membership/subscribe/']")?.getAttribute("href") || null
    );
    if (!subscribeHref) subscribeHref = "/account/membership/subscribe/chefs-depot-membership";
    const status = await goto(page, base, subscribeHref);
    assert(status < 400, `HTTP ${status}`);
  });

  // The subscribe page hides the form behind a Stripe publishable key + price id.
  const notConfigured = await page
    .locator("text=/Payment is not properly configured/i")
    .first()
    .isVisible()
    .catch(() => false);
  if (notConfigured) {
    report.skip(
      { flow: "membership", name: "subscribe via test card", route: subscribeHref || "/account/membership/subscribe" },
      "subscribe page shows 'Payment is not properly configured' — no testMode Stripe gateway / plan stripe_price_id in this DB"
    );
    ctx.isMember = false;
    return;
  }

  await report.step({ flow: "membership", name: "subscribe via test card", route: subscribeHref }, async (s) => {
    await settle(page, 500);
    const stuck = await fillStable(page, "#testCard", testCard);
    assert(stuck, "could not enter the test card (field missing or value reset by hydration)");
    await page.getByRole("button", { name: /Subscribe Now/ }).click();
    let ok = await page
      .waitForURL(/\/account\/membership\/complete-profile/, { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      // attemptTestMembership creates + activates the membership server-side even
      // if the client's hard window.location navigation didn't fire. Confirm by
      // navigating to complete-profile directly.
      await goto(page, base, "/account/membership/complete-profile");
      await settle(page, 400);
      ok = await page.locator("#company").first().isVisible().catch(() => false);
      if (ok) s.warn("post-subscribe auto-navigation did not fire; membership was created (reached complete-profile manually)");
    }
    if (!ok) {
      const err = await page.locator(".bg-sale-bg, .text-sale-deep").first().textContent().catch(() => null);
      throw new Error(err ? `test-card subscribe failed: ${err.trim()}` : "did not reach complete-profile");
    }
  });

  await report.step({ flow: "membership", name: "complete profile", route: "/account/membership/complete-profile" }, async (s) => {
    await settle(page, 500);
    await fillStable(page, "#company", account.company);
    await fillStable(page, "#phone", "0400000000");
    await fillStable(page, "#address1", "100 Test Street");
    await fillStable(page, "#city", "Melbourne");
    await fillStable(page, "#state", "VIC").catch(() => {});
    await fillStable(page, "#postalCode", "3000");
    await page.getByRole("button", { name: /Save & finish/ }).click();
    const ok = await page
      .waitForURL(/\/membership\/welcome/, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    assert(ok, "did not reach /membership/welcome after completing profile");
  });

  await report.step({ flow: "membership", name: "active member on dashboard", route: "/account/membership" }, async (s) => {
    await goto(page, base, "/account/membership");
    const active = await page
      .locator("text=/Cancel membership|Manage billing|Member since|consecutive/i")
      .first()
      .isVisible()
      .catch(() => false);
    assert(active, "membership dashboard does not show an active-member state");
    ctx.isMember = true;
  });
}
