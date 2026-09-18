import test from "node:test";
import assert from "node:assert/strict";
import {
  lineSlug,
  productLineCategorySlugs,
  resolveProductLines,
  type ProductLineCategory,
} from "./brand-product-lines";

/** Rational's four lines exactly as production holds them (2026-09-18): a name
 *  and a category slug, no picture on any of them. */
const RATIONAL = [
  { name: "iCombi Pro", slug: "commercial-combi-ovens" },
  { name: "iCombi Classic", slug: "commercial-combi-ovens" },
  { name: "iVario Cooking Centre", slug: "commercial-combi-ovens" },
  { name: "Rational Duo", slug: "commercial-combi-ovens" },
];

const cats = (rows: ProductLineCategory[]) =>
  new Map<string, ProductLineCategory>(rows.map((r) => [r.slug, r]));

test("a line name slugifies to the slug the category tree uses", () => {
  assert.equal(lineSlug("iCombi Pro"), "icombi-pro");
  assert.equal(lineSlug("Rational Duo"), "rational-duo");
  assert.equal(lineSlug("BME ActiveCore Bottom Mount"), "bme-activecore-bottom-mount");
  assert.equal(lineSlug("  Spaced  &  Punctuated!  "), "spaced-punctuated");
});

test("both candidate slugs are asked for, name first, and only once each", () => {
  assert.deepEqual(productLineCategorySlugs(RATIONAL), [
    "icombi-pro",
    "commercial-combi-ovens",
    "icombi-classic",
    "ivario-cooking-centre",
    "rational-duo",
  ]);
});

test("a brand whose lines already carry pictures costs no lookups at all", () => {
  assert.deepEqual(
    productLineCategorySlugs([{ name: "iCombi Pro", slug: "x", image_url: "https://i/1.jpg" }]),
    []
  );
});

test("a brand with no lines asks for nothing", () => {
  assert.deepEqual(productLineCategorySlugs(undefined), []);
  assert.deepEqual(productLineCategorySlugs(null), []);
  assert.deepEqual(productLineCategorySlugs([]), []);
  assert.deepEqual(productLineCategorySlugs("not an array"), []);
});

test("entries without a usable name are not lines", () => {
  assert.deepEqual(productLineCategorySlugs([{ slug: "a" }, { name: "  " }, null, 3]), []);
  assert.deepEqual(resolveProductLines([{ slug: "a" }, { name: "" }], new Map()), []);
});

test("a line matched by NAME takes that category's picture and its page", () => {
  const resolved = resolveProductLines(
    RATIONAL,
    cats([
      { slug: "icombi-pro", image_url: "https://img/1038.jpg" },
      { slug: "icombi-classic", image_url: "https://img/1039.jpg" },
      { slug: "rational-duo", image_url: "https://img/711.jpg" },
      { slug: "commercial-combi-ovens", image_url: "https://img/250.jpg" },
    ])
  );
  assert.equal(resolved[0].image_url, "https://img/1038.jpg");
  assert.equal(resolved[0].href, "/categories/icombi-pro");
  assert.equal(resolved[1].image_url, "https://img/1039.jpg");
  assert.equal(resolved[1].href, "/categories/icombi-classic");
  assert.equal(resolved[3].image_url, "https://img/711.jpg");
  assert.equal(resolved[3].href, "/categories/rational-duo");
});

test("a line with no category of its own falls back to the authored slug's picture, and keeps its link", () => {
  // iVario Cooking Centre lives at `rational-vario-cooking-centre`, which the
  // name slug cannot reach, so it lands on the parent shelf's photograph rather
  // than on the grey placeholder.
  const resolved = resolveProductLines(
    RATIONAL,
    cats([{ slug: "commercial-combi-ovens", image_url: "https://img/250.jpg" }])
  );
  assert.equal(resolved[2].image_url, "https://img/250.jpg");
  assert.equal(resolved[2].href, undefined);
  assert.equal(resolved[2].slug, "commercial-combi-ovens");
});

test("an authored picture and an authored link are never overruled", () => {
  const resolved = resolveProductLines(
    [{ name: "iCombi Pro", slug: "commercial-combi-ovens", image_url: "https://own.jpg", href: "/x" }],
    cats([{ slug: "icombi-pro", image_url: "https://img/1038.jpg" }])
  );
  assert.equal(resolved[0].image_url, "https://own.jpg");
  assert.equal(resolved[0].href, "/x");
});

test("an authored link survives a name match", () => {
  const resolved = resolveProductLines(
    [{ name: "iCombi Pro", href: "/pages/icombi" }],
    cats([{ slug: "icombi-pro", image_url: "https://img/1038.jpg" }])
  );
  assert.equal(resolved[0].href, "/pages/icombi");
  assert.equal(resolved[0].image_url, "https://img/1038.jpg");
});

test("a category that resolved to nothing leaves the line exactly as authored", () => {
  const resolved = resolveProductLines(RATIONAL, new Map([["icombi-pro", null]]));
  assert.deepEqual(resolved, RATIONAL);
});

test("a matched category with no picture of its own adds no picture", () => {
  const resolved = resolveProductLines(
    [{ name: "iCombi Pro" }],
    cats([{ slug: "icombi-pro", image_url: null }])
  );
  assert.equal(resolved[0].image_url, undefined);
  // The link still moves: the category page exists, it just has no photograph.
  assert.equal(resolved[0].href, "/categories/icombi-pro");
});
