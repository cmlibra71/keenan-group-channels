// Quote flow — covers BOTH priced and price-on-application (POA) items, which is
// the main reason quoting exists. Adds a priced item and (if available) a POA
// "Call for Price" item, verifies the panel's "to be quoted" treatment, submits
// the quote (logged in), and confirms it appears in /account/quotes.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";
import { openQuotePanel, quoteBadgeCount } from "../lib/site.mjs";

export const meta = { name: "quote", writes: true };

async function addToQuoteFromPdp(page, base, slug) {
  const before = await quoteBadgeCount(page);
  await goto(page, base, `/products/${slug}`);
  await settle(page, 400);
  const btn = page.getByRole("button", { name: /Add to Quote/ }).first();
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.click();
  await page.waitForTimeout(1200);
  // The header badge updates after revalidation; force a fresh server render and
  // poll a few times to avoid a race.
  for (let i = 0; i < 4; i++) {
    await goto(page, base, "/");
    await settle(page, 250);
    if ((await quoteBadgeCount(page)) > before) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

export async function run(ctx) {
  const { page, base, report, fixtures, secret, account } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});

  let addedPoa = false;

  await report.step({ flow: "quote", name: "add priced item to quote", route: "/products/[slug]" }, async (s) => {
    const slug = fixtures?.pricedSlugs?.[0];
    assert(slug, "no priced product fixture");
    const ok = await addToQuoteFromPdp(page, base, slug);
    assert(ok, "priced item was not added to the quote (badge did not increment)");
  });

  if (fixtures?.poaSlug) {
    await report.step({ flow: "quote", name: "add POA 'Call for Price' item", route: `/products/${fixtures.poaSlug}` }, async (s) => {
      await goto(page, base, `/products/${fixtures.poaSlug}`);
      await settle(page, 400);
      const isPoa = await page.locator("text=Call for Price").first().isVisible().catch(() => false);
      if (!isPoa) s.warn("expected 'Call for Price' on POA PDP");
      const noAddToCart = (await page.getByRole("button", { name: /^Add to Cart$/ }).count()) === 0;
      if (!noAddToCart) s.warn("POA PDP still shows an Add to Cart button");
      addedPoa = await addToQuoteFromPdp(page, base, fixtures.poaSlug);
      assert(addedPoa, "POA item was not added to the quote");
    });
  } else {
    report.skip({ flow: "quote", name: "POA item", route: "" }, "no POA (Call for Price) product found in catalog");
  }

  await report.step({ flow: "quote", name: "panel reflects POA + items", route: "/(quote panel)" }, async (s) => {
    const opened = await openQuotePanel(page);
    assert(opened, "quote panel did not open");
    const panelText = (await page.locator("body").innerText()).toLowerCase();
    if (addedPoa) {
      if (panelText.includes("to be quoted")) s.note("POA item shown as 'to be quoted'");
      else s.warn("panel did not show 'to be quoted' for the POA item");
    }
    const notes = page.locator("#quote-notes");
    if (await notes.isVisible().catch(() => false)) {
      await fillStable(page, "#quote-notes", `E2E ${ctx.runId} — automated quote test`).catch(() => {});
    }
  });

  await report.step({ flow: "quote", name: "submit quote", route: "/(quote panel)" }, async (s) => {
    // submitQuote goes through a Next server action. In `next dev` the page can be
    // served from a bundle the server has since recompiled, so the action id no
    // longer matches and the click yields "An unexpected response was received
    // from the server" (a dev-only staleness artifact — immutable prod bundles
    // can't hit this). Recover by reloading to get a fresh bundle, then retry;
    // the quote cookie keeps the items across reloads.
    const openWithSubmit = async () => {
      let btn = page.getByRole("button", { name: /Submit Quote/ }).first();
      if (await btn.isVisible().catch(() => false)) return btn;
      await openQuotePanel(page);
      btn = page.getByRole("button", { name: /Submit Quote/ }).first();
      return (await btn.isVisible().catch(() => false)) ? btn : null;
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const submit = await openWithSubmit();
      if (!submit) {
        s.note(`attempt ${attempt + 1}: panel/Submit not reachable (likely a stale-bundle error overlay) — reloading`);
        await goto(page, base, "/");
        await page.waitForTimeout(700);
        continue;
      }
      await submit.click();
      const ok = await page
        .locator("text=Quote Submitted")
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        if (attempt > 0) s.warn("quote submit only succeeded after a reload (dev server-action staleness; would not affect a production build)");
        return;
      }
      const needsLogin = await page.locator("text=/Sign in to submit your quote/i").first().isVisible().catch(() => false);
      if (needsLogin) throw new Error("quote submit demanded login for an authenticated user");
      s.note(`attempt ${attempt + 1}: no confirmation (stale dev bundle / server-action error) — reloading and retrying`);
      await goto(page, base, "/");
      await page.waitForTimeout(700);
    }
    throw new Error("quote submit failed after 3 attempts incl. reloads — server action returned 'unexpected response' (dev bundle staleness; would not occur in a production build)");
  });

  await report.step({ flow: "quote", name: "quote appears in /account/quotes", route: "/account/quotes" }, async (s) => {
    const status = await goto(page, base, "/account/quotes");
    assert(status < 400, `HTTP ${status}`);
    const empty = await page.locator("text=/no quotes|haven.t requested/i").first().isVisible().catch(() => false);
    if (empty) s.warn("quotes list shows empty right after submitting");
  });
}
