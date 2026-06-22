// Browse & discovery: categories (+ filters), brands, search, and a PDP.
// Read-only.
import { goto, assert } from "../lib/harness.mjs";

export const meta = { name: "browse", writes: false };

async function firstHref(page, sel) {
  return page.evaluate((s) => document.querySelector(s)?.getAttribute("href") || null, sel);
}

export async function run(ctx) {
  const { page, base, report } = ctx;
  const t = (name, route, fn) => report.step({ flow: "browse", name, route, severity: "broken" }, fn);

  await t("categories index", "/categories", async (s) => {
    const status = await goto(page, base, "/categories");
    assert(status < 400, `HTTP ${status}`);
    const link = await firstHref(page, "a[href^='/categories/']");
    if (!link) s.warn("no category links found");
    ctx._categoryHref = link;
  });

  await t("category detail + filters", ctx._categoryHref || "/categories/[slug]", async (s) => {
    if (!ctx._categoryHref) return s.warn("skipped — no category link");
    const status = await goto(page, base, ctx._categoryHref);
    assert(status < 400, `HTTP ${status}`);
    const hasProducts = await page.locator("a[href^='/products/']").first().isVisible().catch(() => false);
    if (!hasProducts) s.note("category has no products (may be empty)");
    // Apply a sort to exercise the query param path.
    const sorted = ctx._categoryHref + (ctx._categoryHref.includes("?") ? "&" : "?") + "sort=price_asc";
    const s2 = await goto(page, base, sorted);
    assert(s2 < 400, `sort HTTP ${s2}`);
  });

  await t("brands index", "/brands", async (s) => {
    const status = await goto(page, base, "/brands");
    assert(status < 400, `HTTP ${status}`);
    ctx._brandHref = await firstHref(page, "a[href^='/brands/']");
    if (!ctx._brandHref) s.warn("no brand links found");
  });

  await t("brand detail", ctx._brandHref || "/brands/[slug]", async (s) => {
    if (!ctx._brandHref) return s.warn("skipped — no brand link");
    const status = await goto(page, base, ctx._brandHref);
    assert(status < 400, `HTTP ${status}`);
  });

  await t("search results", "/search?q=oven", async (s) => {
    const status = await goto(page, base, "/search?q=oven");
    assert(status < 400, `HTTP ${status}`);
    const hits = await page.locator("a[href^='/products/']").count().catch(() => 0);
    s.note(`search returned ${hits} product link(s)`);
  });

  await t("product detail page", "/products/[slug]", async (s) => {
    const slug = ctx.fixtures?.pricedSlugs?.[0];
    const href = slug ? `/products/${slug}` : await firstHref(page, "a[href^='/products/']");
    if (!href) return s.fail("broken", "no product link to open a PDP");
    const status = await goto(page, base, href);
    assert(status < 400, `HTTP ${status}`);
    const hasBuy = await page
      .getByRole("button", { name: /Add to Cart|Add to Quote/ })
      .first()
      .isVisible()
      .catch(() => false);
    assert(hasBuy, "PDP missing Add to Cart / Add to Quote");
  });
}
