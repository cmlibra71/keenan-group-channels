// Shared page interactions for Chef's Depot flows. Selectors mirror the real
// components (LoginForm, ProductCard/ProductDetail, CheckoutForm, etc.). All
// interactions go through the hydration-safe helpers in harness.mjs so clicks
// and fills don't race React hydration.
import { goto, settle, fillStable, clickUntil } from "./harness.mjs";

/**
 * Discover product fixtures by scraping listing pages (no DB/price coupling).
 * Returns { pricedSlugs: string[], poaSlug: string|null }. A POA card renders
 * "Call for Price" (ProductCard.tsx).
 */
export async function discoverFixtures(page, base) {
  const pricedSlugs = new Set();
  const poaCandidates = new Set();

  for (const path of ["/products", "/products?page=2", "/clearance"]) {
    await goto(page, base, path);
    await settle(page, 300);
    const found = await page.evaluate(() => {
      const out = { priced: [], poa: [] };
      const seen = new Set();
      for (const a of document.querySelectorAll("a[href^='/products/']")) {
        const m = (a.getAttribute("href") || "").match(/^\/products\/([^/?#]+)/);
        if (!m) continue;
        const slug = m[1];
        if (seen.has(slug)) continue;
        seen.add(slug);
        const card = a.closest("div.group") || a.parentElement;
        const text = (card?.textContent || "").toLowerCase();
        if (text.includes("call for price")) out.poa.push(slug);
        else out.priced.push(slug);
      }
      return out;
    });
    found.priced.forEach((s) => pricedSlugs.add(s));
    found.poa.forEach((s) => poaCandidates.add(s));
    if (pricedSlugs.size >= 10 && poaCandidates.size) break;
  }

  // Confirm a POA candidate actually renders "Call for Price" on its PDP (listing
  // cards can disagree with the PDP). First confirmed wins; else none.
  let poaSlug = null;
  for (const slug of [...poaCandidates].slice(0, 5)) {
    await goto(page, base, `/products/${slug}`);
    await settle(page, 250);
    if (await pdpIsPoa(page)) {
      poaSlug = slug;
      break;
    }
  }

  return { pricedSlugs: [...pricedSlugs], poaSlug };
}

/** True if the PDP shows a "Call for Price" (price-on-application) state. */
export async function pdpIsPoa(page) {
  return page.locator("text=Call for Price").first().isVisible().catch(() => false);
}

/**
 * On a PDP, make "Add to Cart" clickable: satisfy option groups if present.
 * Returns true if a ready Add-to-Cart button is present and enabled.
 */
export async function makeAddToCartReady(page) {
  await settle(page, 400);
  const addBtn = page.getByRole("button", { name: /^Add to Cart$/ }).first();
  if ((await addBtn.count()) === 0) return false;
  if (await addBtn.isEnabled().catch(() => false)) return true;

  const configure = page.locator("text=Configure").first();
  if (await configure.isVisible().catch(() => false)) {
    const opts = page.locator("div:has(> h3:text('Configure')) button:not([disabled])");
    const n = await opts.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 8); i++) {
      await opts.nth(i).click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }
  return addBtn.isEnabled().catch(() => false);
}

async function badge(page, ariaLabel) {
  return page.evaluate((label) => {
    const btn = document.querySelector(`button[aria-label='${label}']`);
    const n = parseInt((btn?.querySelector("span")?.textContent || "0").replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }, ariaLabel);
}
export const cartBadgeCount = (page) => badge(page, "Open cart");
export const quoteBadgeCount = (page) => badge(page, "Open quote");

/** Open the header quote slide-out; waits until the panel content is visible. */
export async function openQuotePanel(page) {
  await settle(page, 400);
  return clickUntil(
    page,
    "button[aria-label='Open quote']",
    "text=/Submit Quote|Your quote is empty|Sign in to submit/i"
  );
}

/** Open the header account slide-out (logged-in: shows "Sign Out"). */
export async function openAccountPanelLoggedIn(page) {
  await settle(page, 400);
  return clickUntil(page, "button[aria-label='Open account']", "text=Sign Out");
}

/** Whether the page currently shows the logged-out login form. */
export async function isLoggedOut(page) {
  return page.locator("#password").first().isVisible().catch(() => false);
}

/** Log out via the header Account panel. Returns true if it reached a logged-out state. */
export async function logoutViaPanel(page, base) {
  await goto(page, base, "/");
  const opened = await openAccountPanelLoggedIn(page);
  if (!opened) return false;
  await page.getByRole("button", { name: /Sign Out/ }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  await goto(page, base, "/account");
  await settle(page, 300);
  return isLoggedOut(page);
}

/** Log in through the real /account login form. */
export async function loginViaForm(page, base, email, password) {
  await goto(page, base, "/account");
  await settle(page, 400);
  await fillStable(page, "#email", email);
  await fillStable(page, "#password", password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.getByRole("button", { name: /Sign In/ }).click(),
  ]);
  await settle(page, 500);
}

/** Register a new account through the real /account/register form. */
export async function registerViaForm(page, base, { email, password, firstName, lastName }) {
  await goto(page, base, "/account/register");
  await settle(page, 400);
  await fillStable(page, "#firstName", firstName);
  await fillStable(page, "#lastName", lastName);
  await fillStable(page, "#email", email);
  await fillStable(page, "#password", password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded").catch(() => {}),
    page.getByRole("button", { name: /Create Account/ }).click(),
  ]);
  await settle(page, 600);
}

/**
 * True if the cart has at least one item, verified via the header cart badge
 * (server-rendered on every page). More reliable than scanning the /cart page
 * for an "empty" string — the off-screen CartPanel slide-out renders that string
 * in the DOM, which Playwright still counts as visible.
 */
async function cartHasItems(page, base) {
  for (let i = 0; i < 4; i++) {
    await goto(page, base, "/cart");
    await settle(page, 250);
    if ((await cartBadgeCount(page)) > 0) return true;
    await page.waitForTimeout(600); // revalidation lag — poll again
  }
  return false;
}

/**
 * Add a priced product to the cart from its PDP. Tries candidate slugs until one
 * is in stock + adds successfully (verified via the header cart badge). Stops at
 * the first success so it doesn't pile up items. Returns the slug used, or null.
 */
export async function addPricedProductToCart(page, base, slugs) {
  for (const slug of slugs.slice(0, 8)) {
    const status = await goto(page, base, `/products/${slug}`);
    if (status >= 400) continue;
    if (!(await makeAddToCartReady(page))) continue;
    await page.getByRole("button", { name: /^Add to Cart$/ }).first().click();
    await page.waitForTimeout(1200);
    if (await cartHasItems(page, base)) return slug;
  }
  return null;
}

/** Add a single specific product (by slug) to the cart; returns true on success. */
export async function addSlugToCart(page, base, slug) {
  const status = await goto(page, base, `/products/${slug}`);
  if (status >= 400) return false;
  if (!(await makeAddToCartReady(page))) return false;
  await page.getByRole("button", { name: /^Add to Cart$/ }).first().click();
  await page.waitForTimeout(1200);
  return cartHasItems(page, base);
}

/** Remove every line from the cart (best-effort) so a price check sees one item. */
export async function clearCart(page, base) {
  await goto(page, base, "/cart");
  await settle(page, 300);
  for (let i = 0; i < 12; i++) {
    // The cart line "remove" control is an unlabelled button with a trash icon.
    const del = page.locator("button:has(svg.lucide-trash-2), button:has(svg.lucide-trash2)").first();
    if (!(await del.isVisible().catch(() => false))) break;
    await del.click().catch(() => {});
    await page.waitForTimeout(800);
    await goto(page, base, "/cart");
    await settle(page, 250);
  }
}

/** The first "$X.YZ each" unit price on the /cart page (null if none). */
export async function firstCartUnitPrice(page) {
  return page.evaluate(() => {
    const m = (document.body.innerText || "").match(/\$\s?([\d,]+\.\d{2})\s*each/i);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
  });
}

/** The headline ($) price shown in the PDP pricing card (member price for members). */
export async function pdpHeadlinePrice(page) {
  return page.evaluate(() => {
    const card =
      document.querySelector("[class*='border-l-member']") ||
      document.querySelector("main");
    const nums = [...(card?.textContent || "").matchAll(/\$\s?([\d,]+\.\d{2})/g)].map((m) =>
      parseFloat(m[1].replace(/,/g, ""))
    );
    return nums.length ? nums[0] : null;
  });
}

/** Best-effort fill of a Stripe single-card Element across its iframes (test card 4242). */
export async function fillStripeCard(page) {
  const frame = page
    .frameLocator("iframe[name^='__privateStripeFrame'], iframe[title*='payment'], iframe[title*='Secure']")
    .first();
  await frame.locator("[name='cardnumber'], [placeholder*='Card number']").first().fill("4242424242424242", { timeout: 6000 });
  await frame.locator("[name='exp-date'], [placeholder*='MM']").first().fill("12 34", { timeout: 6000 });
  await frame.locator("[name='cvc'], [placeholder*='CVC']").first().fill("123", { timeout: 6000 });
  // Postal appears after the card number for some Stripe configs; give it time
  // and try the common selectors. Some elements don't show it at all (no-op).
  await frame
    .locator("[name='postal'], [name='postalCode'], [placeholder*='ZIP'], [placeholder*='postcode'], [placeholder*='Postal']")
    .first()
    .fill("3000", { timeout: 5000 })
    .catch(() => {});
}
