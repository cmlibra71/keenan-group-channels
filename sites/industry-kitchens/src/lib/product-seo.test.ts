import { test } from "node:test";
import assert from "node:assert/strict";
import {
  excerpt,
  jsonLdScript,
  productCanonicalUrl,
  productJsonLd,
  productMainImage,
  productMetaDescription,
  productPageTitle,
  publicDisplayPrice,
} from "./product-seo.ts";

// Titles measured on the OLD site (www.industrykitchens.com.au) on 2026-09-28 — the oracle.
test("title matches the old site: page_title as imported, which already names the store", () => {
  assert.equal(
    productPageTitle({
      name: "Hoshizaki IM-30CNE-25 Cube Ice Maker 15kg/day",
      pageTitle: "Hoshizaki IM-30CNE-25 Cube Ice Maker 18kg/day | Industry Kitchens",
    }),
    "Hoshizaki IM-30CNE-25 Cube Ice Maker 18kg/day | Industry Kitchens"
  );
  assert.equal(
    productPageTitle({
      name: "Hoshizaki KMD-270AB Crescent Ice Maker 255kg/day - BUNDLE",
      pageTitle: "Hoshizaki KMD-270AB Crescent Ice Maker 255kg/day | Industry Kitchens",
    }),
    "Hoshizaki KMD-270AB Crescent Ice Maker 255kg/day | Industry Kitchens"
  );
});

test("no page_title: '<name> | Industry Kitchens'", () => {
  assert.equal(
    productPageTitle({ name: "Rational Duo iCombi Pro 6-1/1 GN Gas Combi Oven", pageTitle: null }),
    "Rational Duo iCombi Pro 6-1/1 GN Gas Combi Oven | Industry Kitchens"
  );
  assert.equal(productPageTitle({ name: "Frymate Filter", pageTitle: "   " }), "Frymate Filter | Industry Kitchens");
});

test("a page_title without the store name gets it appended, never twice", () => {
  assert.equal(productPageTitle({ name: "x", pageTitle: "Custom SEO title" }), "Custom SEO title | Industry Kitchens");
  assert.equal(productPageTitle({ name: "x", pageTitle: "Buy at Industry Kitchens" }), "Buy at Industry Kitchens");
});

test("meta description: the product's own, else a clean excerpt, else a sentence naming the product", () => {
  assert.equal(productMetaDescription({ metaDescription: "  Own <b>words</b>  " }), "Own words");
  const long = `<p>${"Heavy duty stainless steel ".repeat(20)}</p>`;
  const d = productMetaDescription({ metaDescription: "", description: long });
  assert.ok(d.length <= 160, `excerpt is ${d.length} chars`);
  assert.ok(d.endsWith("…"));
  assert.equal(d.includes("<"), false);
  assert.equal(productMetaDescription({ descriptionShort: "Short &amp; sweet" }), "Short & sweet");
  assert.equal(
    productMetaDescription({ name: "Widget" }),
    "Widget — commercial kitchen equipment from Industry Kitchens."
  );
});

test("excerpt never cuts mid-word", () => {
  assert.equal(excerpt("alpha beta gamma delta", 12), "alpha beta…");
  assert.equal(excerpt("short", 12), "short");
});

test("canonical is the product's own /products/<slug> on this site", () => {
  assert.equal(
    productCanonicalUrl("hoshizaki-kmd-270ab", "https://industrialkitchens.com.au/"),
    "https://industrialkitchens.com.au/products/hoshizaki-kmd-270ab"
  );
});

test("main image: the thumbnail-flagged one, else the first by sort order, made absolute", () => {
  const base = "https://industrialkitchens.com.au";
  assert.equal(
    productMainImage(
      [
        { urlStandard: "https://cdn.example/b.jpg", sortOrder: 2 },
        { urlStandard: "https://cdn.example/a.jpg", sortOrder: 1 },
      ],
      base
    ),
    "https://cdn.example/a.jpg"
  );
  assert.equal(
    productMainImage(
      [
        { urlStandard: "https://cdn.example/a.jpg", sortOrder: 1 },
        { urlStandard: "/uploads/main.jpg", sortOrder: 5, isThumbnail: true },
      ],
      base
    ),
    "https://industrialkitchens.com.au/uploads/main.jpg"
  );
  assert.equal(productMainImage([], base), null);
  assert.equal(productMainImage(undefined, base), null);
});

test("the offer carries the price the page shows: sale if any, else price, ex GST", () => {
  assert.equal(publicDisplayPrice({ price: "3996.0000", salePrice: "2514.6800" }), 2514.68);
  assert.equal(publicDisplayPrice({ price: "5716.7400", salePrice: null }), 5716.74);
  const ld = productJsonLd({
    name: "Hoshizaki IM-30CNE-25",
    sku: "HOS-IM-30CNE-25",
    brandName: "Hoshizaki",
    image: "https://cdn.example/a.jpg",
    price: "3996.0000",
    salePrice: "2514.6800",
    availability: "available",
    url: "https://industrialkitchens.com.au/products/x",
  });
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.sku, "HOS-IM-30CNE-25");
  assert.deepEqual(ld.brand, { "@type": "Brand", name: "Hoshizaki" });
  assert.deepEqual(ld.image, ["https://cdn.example/a.jpg"]);
  const offer = ld.offers as Record<string, unknown>;
  assert.equal(offer.price, "2514.68");
  assert.equal(offer.priceCurrency, "AUD");
  assert.equal(offer.availability, "https://schema.org/InStock");
  assert.equal((offer.priceSpecification as Record<string, unknown>).valueAddedTaxIncluded, false);
});

test("quote-only / POA products get NO offer", () => {
  const base = { name: "x", url: "https://industrialkitchens.com.au/products/x", price: "100" };
  for (const extra of [
    { price: "0.0000" },
    { price: null },
    { hidePrice: true },
    { purchasingDisabled: true },
    { restrictAddToCart: true },
  ]) {
    const ld = productJsonLd({ ...base, ...extra });
    assert.equal("offers" in ld, false, JSON.stringify(extra));
  }
});

test("the JSON-LD script cannot close its own tag", () => {
  assert.equal(jsonLdScript({ name: "</script><b>" }).includes("</script>"), false);
});
