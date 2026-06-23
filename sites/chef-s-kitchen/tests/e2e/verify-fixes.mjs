// One-off visual verification of this session's fixes against a live local copy.
// Drives a full member journey with cloakbrowser, screenshots each fixed surface,
// captures the rendered data, and cleans up. Run: node verify-fixes.mjs [baseUrl]
import { mkdirSync } from "node:fs";
import { open } from "./lib/cloak.mjs";
import { loadSiteEnv, goto, settle, fillStable } from "./lib/harness.mjs";
import { registerViaForm, addSlugToCart, clearCart, openAccountPanelLoggedIn, firstCartUnitPrice, pdpHeadlinePrice } from "./lib/site.mjs";
import { purgeTestData, getCustomerMembership, getOrderByNumber, closeSql } from "./lib/db.mjs";

loadSiteEnv();
const base = (process.argv[2] || "http://localhost:3002").replace(/\/$/, "");
const ts = Date.now();
const SLUG = "11020-11-x-20-mm-gastronorm-pan-australian-style"; // known member price $12 / RRP $18
const testCard = process.env.MEMBERSHIP_TEST_CARD || "4065871315315604";
const account = { email: `e2e-verify-${ts}@e2e.test`, password: "Test1234!aA", firstName: "Verity", lastName: "Member" };
const dir = "/tmp/verify";
mkdirSync(dir, { recursive: true });
const shot = async (page, name) => { await page.screenshot({ path: `${dir}/${name}.png` }); };

const r = {};
const { ctx, page } = await open({ profile: "cd-verify", headless: true });
try {
  await ctx.clearCookies();

  // Register a fresh customer, then become a member via the staff test card.
  await registerViaForm(page, base, account);
  await goto(page, base, "/account/membership");
  let href = await page.evaluate(() => document.querySelector("a[href*='/account/membership/subscribe/']")?.getAttribute("href") || null);
  href = href || "/account/membership/subscribe/chefs-depot-membership";
  await goto(page, base, href);
  await settle(page, 700);
  // In production NODE_ENV the subscribe page gates on a live Stripe gateway; if
  // it isn't configured the test-card field never renders. Detect + skip.
  const notConfigured = await page.locator("text=/Payment is not properly configured/i").first().isVisible().catch(() => false);
  if (notConfigured) {
    r.membershipAvailable = false;
  } else {
    r.membershipAvailable = true;
    await fillStable(page, "#testCard", testCard);
    await page.getByRole("button", { name: /Subscribe Now/ }).click();
    let ok = await page.waitForURL(/complete-profile/, { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ok) { await goto(page, base, "/account/membership/complete-profile"); await settle(page, 500); }
    await fillStable(page, "#company", "Verify Co");
    await fillStable(page, "#phone", "0400000000");
    await fillStable(page, "#address1", "100 Test Street");
    await fillStable(page, "#city", "Melbourne");
    await fillStable(page, "#state", "VIC").catch(() => {});
    await fillStable(page, "#postalCode", "3000");
    await page.getByRole("button", { name: /Save & finish/ }).click();
    await page.waitForURL(/welcome/, { timeout: 20000 }).catch(() => {});
  }

  r.membership = await getCustomerMembership(account.email).catch(() => null);
  r.isMember = r.membership?.sub_status === "active" && !!r.membership?.customer_group_id;

  // FIX 1 — account dashboard shows the customer's name (was blank).
  await goto(page, base, "/account");
  await settle(page, 600);
  await shot(page, "1-account-dashboard");
  r.dashboardText = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 260);

  // FIX (order leak) — a customer with no orders must see an EMPTY order history
  // (previously leaked the 50 newest orders across all customers/channels).
  await goto(page, base, "/account/orders");
  await settle(page, 600);
  r.ordersBefore = await page.evaluate(() => {
    const t = document.querySelector("main")?.innerText || "";
    return { orderCards: (t.match(/Order #/g) || []).length, empty: /no orders/i.test(t), hasNaN: /NaN/.test(t) };
  });

  // FIX 2 — member price on the PDP, and (critical) the SAME price charged in the cart.
  await goto(page, base, `/products/${SLUG}`);
  await settle(page, 500);
  await shot(page, "2-pdp-member-price");
  r.pdpPrice = await pdpHeadlinePrice(page);

  await clearCart(page, base);
  await addSlugToCart(page, base, SLUG);
  await goto(page, base, "/cart");
  await settle(page, 400);
  await shot(page, "3-cart-member-price");
  r.cartUnitPrice = await firstCartUnitPrice(page);

  // FIX 3 — order number renders (was "undefined") on the bank-transfer confirmation.
  await goto(page, base, "/checkout");
  await settle(page, 800);
  if (await page.locator("input[name='address1']").first().isVisible().catch(() => false)) {
    await fillStable(page, "input[name='firstName']", account.firstName).catch(() => {});
    await fillStable(page, "input[name='lastName']", account.lastName).catch(() => {});
    await fillStable(page, "input[name='address1']", "100 Test Street");
    await fillStable(page, "input[name='city']", "Melbourne").catch(() => {});
    await fillStable(page, "input[name='postalCode']", "3000");
    await page.waitForTimeout(900);
  }
  await page.locator("input[name='paymentMethod'][value='bank_transfer']").check().catch(() => {});
  await page.getByRole("button", { name: /Place Order/ }).first().click();
  await page.waitForURL(/checkout\/confirmation/, { timeout: 35000 }).catch(() => {});
  await settle(page, 500);
  await shot(page, "4-order-confirmation");
  r.orderNumber = new URL(page.url()).searchParams.get("order");
  r.confirmationText = (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 320);
  if (r.orderNumber) r.orderRow = await getOrderByNumber(r.orderNumber).catch(() => null);

  // FIX (order leak) — after ordering, the customer sees ONLY their own order.
  await goto(page, base, "/account/orders");
  await settle(page, 600);
  r.ordersAfter = await page.evaluate((ordNum) => {
    const t = document.querySelector("main")?.innerText || "";
    return {
      orderCards: (t.match(/Order #/g) || []).length,
      showsOwn: ordNum ? t.includes(ordNum) : false,
      hasNaN: /NaN/.test(t),
    };
  }, r.orderNumber);

  // FIX 3b — account slide-out panel name.
  await goto(page, base, "/");
  await settle(page, 400);
  await openAccountPanelLoggedIn(page).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, "5-account-panel");
} catch (e) {
  r.error = e.message;
} finally {
  await ctx.close();
  const cleanup = await purgeTestData({ emailLike: "e2e-verify-%@e2e.test" }).catch((e) => ({ error: e.message }));
  await closeSql();
  console.log("RESULTS " + JSON.stringify(r, null, 2));
  console.log("CLEANUP " + JSON.stringify(cleanup));
}
