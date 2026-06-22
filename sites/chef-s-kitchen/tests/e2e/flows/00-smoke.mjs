// Smoke: load every public/guest route, assert it renders (HTTP < 400, no error
// boundary, a key element present), and screenshot it. Zero writes — safe to run
// against production with --smoke-only.
import { goto, assert } from "../lib/harness.mjs";

export const meta = { name: "smoke", writes: false };

const STATIC_ROUTES = [
  ["home", "/", "h1, header"],
  ["all products", "/products", "a[href^='/products/']"],
  ["products featured", "/products?filter=featured", "main, h1"],
  ["products on sale", "/products?filter=sale", "main, h1"],
  ["categories", "/categories", "a[href^='/categories/']"],
  ["brands", "/brands", "a[href^='/brands/']"],
  ["clearance", "/clearance", "main, h1"],
  ["search", "/search?q=oven", "main"],
  ["membership", "/membership", "main, h1"],
  ["cart (empty)", "/cart", "main"],
  ["checkout (empty→cart)", "/checkout", "main"],
  ["account (login)", "/account", "#email, #password"],
  ["register", "/account/register", "#email"],
];

const CONTENT_PAGES = ["returns", "shipping", "privacy", "terms", "warranty", "contact"];

async function pageLooksBroken(page) {
  return page.evaluate(() => {
    const t = document.body?.innerText || "";
    return (
      t.includes("Application error") ||
      t.includes("Internal Server Error") ||
      t.includes("client-side exception")
    );
  });
}

export async function run(ctx) {
  const { page, base, report } = ctx;
  const t = (name, route, fn, severity = "broken") =>
    report.step({ flow: "smoke", name, route, severity }, fn);

  for (const [name, route, sel] of STATIC_ROUTES) {
    await t(name, route, async (s) => {
      const status = await goto(page, base, route);
      assert(status > 0 && status < 400, `HTTP ${status}`);
      assert(!(await pageLooksBroken(page)), "page shows an application error");
      if (sel) {
        const ok = await page.locator(sel).first().isVisible().catch(() => false);
        if (!ok) s.warn(`expected element not visible: ${sel}`);
      }
    });
  }

  // Content pages — a missing one is a warning, not a blocker (may be unseeded).
  for (const slug of CONTENT_PAGES) {
    const route = `/pages/${slug}`;
    await t(`content: ${slug}`, route, async (s) => {
      const status = await goto(page, base, route);
      if (status === 404) {
        s.warn("content page 404 (not seeded?)");
        return;
      }
      assert(status < 400, `HTTP ${status}`);
      assert(!(await pageLooksBroken(page)), "page shows an application error");
    }, "warning");
  }

  // One real PDP / category / brand — grab a link from each listing page itself
  // (not whatever page happens to be loaded last).
  const pickFrom = async (listPath, sel) => {
    await goto(page, base, listPath);
    return page.evaluate((s) => document.querySelector(s)?.getAttribute("href") || null, sel);
  };
  const sample = {
    product: await pickFrom("/products", "a[href^='/products/']"),
    category: await pickFrom("/categories", "a[href^='/categories/']"),
    brand: await pickFrom("/brands", "a[href^='/brands/']"),
  };
  for (const [name, href] of Object.entries(sample)) {
    if (!href) {
      report.skip({ flow: "smoke", name: `sample ${name}`, route: "" }, "no link found on listing");
      continue;
    }
    await t(`sample ${name}`, href, async (s) => {
      const status = await goto(page, base, href);
      assert(status < 400, `HTTP ${status}`);
      assert(!(await pageLooksBroken(page)), "page shows an application error");
    });
  }
}
