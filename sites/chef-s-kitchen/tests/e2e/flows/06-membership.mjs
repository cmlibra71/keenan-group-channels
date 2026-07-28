// Become a member via the staff/QA test card (no Stripe charge), complete the
// required business profile, and confirm active membership. Sets ctx.isMember
// so later flows know whether member-only paths are reachable.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";
import { fillStripeCard } from "../lib/site.mjs";

/** Is the membership dashboard showing an ACTIVE member (not the Rejoin state)? */
async function isActiveMember(page, base) {
  await goto(page, base, "/account/membership");
  await settle(page, 400);
  return page
    .locator("text=/Cancel membership|Manage billing|Member since|consecutive/i")
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Activate membership through the REAL Stripe card path (test-mode 4242).
 *
 * Needed because the staff test-card shortcut (attemptTestMembership) is hard
 * disabled when NODE_ENV=production — deliberately, so a leaked env var can never
 * grant free paid membership in prod. Against a production base URL that shortcut
 * can therefore never activate, and without this fallback every downstream
 * member-only flow (notably member-vs-guest pricing) is skipped.
 */
async function subscribeViaRealStripe(page, base, href) {
  const status = await goto(page, base, href);
  if (status >= 400) return { ok: false, why: `subscribe page HTTP ${status}` };
  await settle(page, 800);
  const mounted = await page
    .locator("iframe[name^='__privateStripeFrame']")
    .first()
    .waitFor({ state: "visible", timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) return { ok: false, why: "Stripe card element did not mount" };
  await fillStripeCard(page);
  const btn = page.getByRole("button", { name: /Subscribe Now/ }).first();
  for (let i = 0; i < 16 && (await btn.isDisabled().catch(() => false)); i++) await page.waitForTimeout(500);
  await btn.click();
  const ok = await page
    .waitForURL(/\/account\/membership\/complete-profile/, { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  if (ok) return { ok: true };
  const err = await page.locator(".bg-sale-bg, .text-sale-deep, .text-sale").first().textContent().catch(() => null);
  return { ok: false, why: err ? err.trim() : "did not reach complete-profile" };
}

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

  // NOTE on the test card: the FIELD renders everywhere, but the server-side
  // shortcut behind it (attemptTestMembership) is hard-disabled when the server
  // runs NODE_ENV=production — deliberately, so a leaked env var can never grant
  // free paid membership in prod. So against a live storefront the field accepts
  // the card, the shortcut declines, and the subscription is left inactive. We
  // therefore judge by the RESULT below and fall back to the real Stripe card.
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

  // Judge by the RESULT, not by which control we used: if the shortcut was
  // declined server-side (production), the subscription exists but is inactive.
  // Fall back to the REAL Stripe test-mode card (4242) — the same path flow 11
  // proves works on prod — so membership genuinely activates and the member-only
  // flows below (notably member-vs-guest pricing) actually run instead of being
  // skipped.
  if (!(await isActiveMember(page, base))) {
    await report.step({ flow: "membership", name: "activate via real Stripe (test mode)", route: subscribeHref }, async (s) => {
      const outcome = await subscribeViaRealStripe(page, base, subscribeHref);
      if (outcome.ok) {
        s.note("staff test-card shortcut is disabled on production by design — activated with the real Stripe test-mode card (4242)");
        return;
      }
      // Not reaching complete-profile is NOT necessarily a failure: if the
      // membership activated in the meantime, the subscribe page redirects an
      // existing member away. Judge by the end state, not the navigation.
      if (await isActiveMember(page, base)) {
        s.note(`membership already active — no fallback needed (subscribe page redirected: ${outcome.why})`);
        return;
      }
      throw new Error(`real Stripe fallback failed: ${outcome.why}`);
    });
    // The fallback lands on complete-profile again; finish it if shown.
    if (/\/account\/membership\/complete-profile/.test(page.url())) {
      await settle(page, 500);
      await fillStable(page, "#company", account.company).catch(() => {});
      await fillStable(page, "#phone", "0400000000").catch(() => {});
      await fillStable(page, "#address1", "100 Test Street").catch(() => {});
      await fillStable(page, "#city", "Melbourne").catch(() => {});
      await fillStable(page, "#state", "VIC").catch(() => {});
      await fillStable(page, "#postalCode", "3000").catch(() => {});
      await page.getByRole("button", { name: /Save & finish/ }).click().catch(() => {});
      await page.waitForURL(/\/membership\/welcome/, { timeout: 30000 }).catch(() => {});
    }
  }

  await report.step({ flow: "membership", name: "active member on dashboard", route: "/account/membership" }, async (s) => {
    const active = await isActiveMember(page, base);
    assert(active, "membership dashboard does not show an active-member state");
    ctx.isMember = true;
  });
}
