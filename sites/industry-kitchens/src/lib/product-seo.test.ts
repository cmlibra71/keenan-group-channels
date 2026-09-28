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

// IK judge wave 1 (2026-09-28): the raw sale_price leaked into the offer when it was NOT below the
// price. DB rows as measured; the page and the cart both charge the list price for these.
test("a 'sale' at or above the price is not a sale: the offer is the price the page shows", () => {
  const url = "https://industrialkitchens.com.au/products/x";
  const cases: Array<[string, string, string]> = [
    ["11.9500", "72.5800", "11.95"], // Kilner 01627 (20877)
    ["40.8600", "438.8200", "40.86"], // Opinel OPI-002192 (212510)
    ["7.9500", "93.4700", "7.95"], // Avanti 132839 (3834)
    ["2770.0000", "2770.0000", "2770.00"], // sale = price (48315)
  ];
  for (const [price, salePrice, expected] of cases) {
    const offer = productJsonLd({ name: "x", url, price, salePrice }).offers as Record<string, unknown>;
    assert.equal(offer["@type"], "Offer");
    assert.equal(offer.price, expected, `${price}/${salePrice}`);
    assert.equal((offer.priceSpecification as Record<string, unknown>).price, expected);
  }
  // A real sale still wins.
  assert.equal(publicDisplayPrice({ price: "2540.0000", salePrice: "1899.0000" }), 1899);
});

test("a configurable publishes its Starting From range, never the parent's bogus sale", () => {
  // Durafurn Seattle (7625): parent 54.00 / sale 408.18, variants 565.00 and 54.00, 2 options.
  const seattle = productJsonLd({
    name: "Durafurn Seattle",
    url: "https://industrialkitchens.com.au/products/durafurn-seattle-twin-folding-table-base",
    price: "54.0000",
    salePrice: "408.1800",
    variants: [
      { id: 810, price: "565.0000", salePrice: null },
      { id: 812, price: "54.0000", salePrice: null },
    ],
    options: [{ id: 1 }, { id: 2 }],
    variantOptionMappings: [{ variantId: 810 }, { variantId: 810 }, { variantId: 812 }, { variantId: 812 }],
  });
  const agg = seattle.offers as Record<string, unknown>;
  assert.equal(agg["@type"], "AggregateOffer");
  assert.equal(agg.lowPrice, "54.00");
  assert.equal(agg.highPrice, "565.00");
  assert.equal(agg.offerCount, 2);
  assert.equal("price" in agg, false);

  // Elizabeth coffee beans (25290): parent 0.00, variants 59.40 / 28.80 → from $28.80.
  const beans = productJsonLd({
    name: "Elizabeth",
    url: "https://industrialkitchens.com.au/products/beans",
    price: "0.0000",
    salePrice: null,
    variants: [
      { id: 2272, price: "59.4000", salePrice: null },
      { id: 2273, price: "28.8000", salePrice: null },
    ],
    options: [{ id: 9 }],
    variantOptionMappings: [{ variantId: 2272 }, { variantId: 2273 }],
  });
  const b = beans.offers as Record<string, unknown>;
  assert.equal(b.lowPrice, "28.80");
  assert.equal(b.highPrice, "59.40");
  assert.equal(publicDisplayPrice({ price: "0", variants: [{ id: 1, price: "28.80" }], options: [{}], variantOptionMappings: [{ variantId: 1 }] }), 28.8);
});

test("a configurable priced at $0 everywhere, or quote only, still gets NO offer", () => {
  const url = "https://industrialkitchens.com.au/products/x";
  const zero = {
    name: "Opinel POA parent",
    url,
    price: "0.0000",
    variants: [{ id: 1, price: "0.0000" }, { id: 2, price: null }],
    options: [{ id: 1 }],
    variantOptionMappings: [{ variantId: 1 }, { variantId: 2 }],
  };
  assert.equal("offers" in productJsonLd(zero), false);
  const pricedButQuoteOnly = { ...zero, variants: [{ id: 1, price: "28.80" }], purchasingDisabled: true };
  assert.equal("offers" in productJsonLd(pricedButQuoteOnly), false);
});

test("a simple product's lone base variant (no option mappings) does not make it configurable", () => {
  // Robot Coupe 27382 (219986): parent 1050 / sale 966, one unmapped variant at 1050.
  const offer = productJsonLd({
    name: "Robot Coupe 27382",
    url: "https://industrialkitchens.com.au/products/x",
    price: "1050.0000",
    salePrice: "966.0000",
    variants: [{ id: 1293744, price: "1050.0000", salePrice: null }],
    options: [],
    variantOptionMappings: [],
  }).offers as Record<string, unknown>;
  assert.equal(offer["@type"], "Offer");
  assert.equal(offer.price, "966.00");
});

test("the JSON-LD script cannot close its own tag", () => {
  assert.equal(jsonLdScript({ name: "</script><b>" }).includes("</script>"), false);
});
