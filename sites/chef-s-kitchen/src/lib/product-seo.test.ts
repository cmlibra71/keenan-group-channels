import { test } from "node:test";
import assert from "node:assert/strict";
import { productPageSeo } from "./product-seo.ts";

const product = {
  name: "Festive Cornwall CA9 Ambient Display Cabinet 900mm",
  metaDescription:
    "Festive CA9 Cornwall Ambient Display Cabinet, 900mm, for commercial food display; available from Industry Kitchens.",
  descriptionShort: "Festive Cornwall CA9 Ambient Display Cabinet 900mm<br>Model:&nbsp;CA9",
};

test("Chefs Depot's own title and description win", () => {
  const out = productPageSeo(product, {
    pageTitle: "Festive Cornwall CA9 Ambient Cabinet | Chefs Depot",
    metaDescription: "A 900mm ambient display cabinet. Shop it at Chefs Depot.",
  });
  assert.equal(out.title, "Festive Cornwall CA9 Ambient Cabinet | Chefs Depot");
  assert.equal(out.description, "A 900mm ambient display cabinet. Shop it at Chefs Depot.");
});

test("with no row of its own, the title stays the product name", () => {
  assert.equal(productPageSeo(product, null).title, product.name);
});

test("the fallback never serves a description naming Industry Kitchens", () => {
  const out = productPageSeo(product, null);
  assert.doesNotMatch(out.description, /industry kitchens/i);
  assert.equal(out.description, "Festive Cornwall CA9 Ambient Display Cabinet 900mm Model: CA9");
});

test("a shared description without the other store's name is still used", () => {
  const out = productPageSeo({ ...product, metaDescription: "A good cabinet." }, null);
  assert.equal(out.description, "A good cabinet.");
});

test("a row with one half empty falls back for that half only", () => {
  const out = productPageSeo(product, { pageTitle: "CA9 | Chefs Depot", metaDescription: null });
  assert.equal(out.title, "CA9 | Chefs Depot");
  assert.doesNotMatch(out.description, /industry kitchens/i);
});

test("the last resort names Chefs Depot, and everything is capped at 160", () => {
  const out = productPageSeo({ name: "Tongs", metaDescription: "", descriptionShort: null }, null);
  assert.equal(out.description, "Tongs — professional kitchen equipment at Chefs Depot.");
  const long = productPageSeo({ name: "X", metaDescription: "word ".repeat(80) }, null);
  assert.ok(long.description.length <= 160);
});
