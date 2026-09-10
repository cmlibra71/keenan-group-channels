import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Source guard: THIS fork's product route must feed the purchase provider its extras.
 *
 * The panel is decided by one predicate (`addonPanelShown`, read as
 * `addonGroupsOffered`), but a predicate cannot save a route that supplies no DATA:
 * `purchase.addons` undefined makes `addonPanelShown` false, the panel does not draw,
 * and all four buy controls post no picks. That is a silent, money-shaped failure —
 * a shopper on a Hallde RG-100 sees no blades to tick and is charged for the machine
 * alone — and it is invisible to every unit test of the predicate itself.
 *
 * It has already happened once. The first cut of card KvLJOAON added
 * `addons: readProductAddons(product.metafields)` to the TEMPLATE and to Industry
 * Kitchens and missed Chefs Depot, whose route builds `ctx.buybox.product` for
 * `blocks/product-page-blocks.tsx` instead of writing a `<ProductPageClient product={{…}}>`
 * literal. Nothing failed: production stayed correct only because
 * `node_product_template_enabled` happens to be true on both channels, and that flag is
 * one operator click on Storefront -> Pages (card BNtsJACK). Turn it off on Chefs Depot
 * and one storefront would have offered the extras while the other did not, on the same
 * product — the exact "two renderers reading the same record differently" failure the
 * behaviour register exists to catch (catalogue.md `sf-product-page`).
 *
 * This file is a SHARED module, so each site carries its own copy and each copy checks
 * its own `app/products/[slug]/page.tsx`. A new fork gets the guard with the sync.
 *
 * The shape of the call is asserted, not just the identifier: reading the metafields bag
 * and then not passing it on would satisfy a bare `grep`.
 *
 * (Cards 0CDcCYmO / KvLJOAON x 7vu2iEEZ.)
 */

const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const ROUTE = "app/products/[slug]/page.tsx";

test("the product route hands the purchase provider its paid extras", () => {
  const source = readFileSync(path.join(SRC, ROUTE), "utf8");

  // The file really is the product route (catches a rename or a move).
  assert.match(
    source,
    /getProductBySlug/,
    `${ROUTE} no longer looks like the product route — re-point this guard.`
  );

  assert.match(
    source,
    /import\s*\{[^}]*\breadProductAddons\b[^}]*\}\s*from\s*["']@keenan\/services\/product-addons["']/,
    `${ROUTE} does not import readProductAddons from @keenan/services/product-addons.`
  );

  // Fed INTO the provider payload, not merely computed. Both shapes are legitimate:
  // the template and Industry Kitchens write the literal `product={{ … }}`, Chefs Depot
  // fills `ctx.buybox.product` — either way the key is `addons`.
  assert.match(
    source,
    /addons:\s*readProductAddons\(\s*product\.metafields\s*\)/,
    `${ROUTE} must pass 'addons: readProductAddons(product.metafields)' into the buy-box ` +
      `product payload, or the LEGACY renderer draws no extras panel and its buy controls ` +
      `post no picks while the node renderer's do.`
  );

  // The extras ride the SAME portal-owned metafields bag the kit does, and the kit read
  // is the anchor a future editor will copy. If the kit read ever leaves this route, the
  // extras read almost certainly should too — fail loudly rather than drift apart.
  assert.match(
    source,
    /readProductKit\(\s*product\.metafields\s*\)/,
    `${ROUTE} no longer reads the kit off product.metafields — the extras read sits ` +
      `beside it by design; re-check both together.`
  );
});
