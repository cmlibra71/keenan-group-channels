import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySurface, SURFACE_LIMITS, type SurfaceClass } from "./surfaces.ts";

const CASES: [string, SurfaceClass][] = [
  // Operational routes that must never be guarded.
  ["/api/health", "exempt"],
  ["/api/health/", "exempt"],
  ["/api/revalidate", "exempt"],
  ["/api/impersonate", "exempt"],
  ["/api/preview/enter", "exempt"],
  ["/api/preview/exit", "exempt"],
  ["/api/test/login", "exempt"],
  ["/robots.txt", "exempt"],
  ["/favicon.ico", "exempt"],

  ["/sitemap.xml", "sitemap"],

  ["/search", "search"],
  ["/api/search", "search"],

  ["/api/image", "image"],
  ["/api/hero-atlas", "image"],

  ["/api/shipping/calculate", "api"],
  ["/api/blocks/manifest", "api"],

  ["/checkout", "checkout"],
  ["/checkout/confirmation", "checkout"],
  ["/cart", "checkout"],
  ["/account", "checkout"],
  ["/account/orders", "checkout"],
  ["/membership", "checkout"],

  ["/categories", "listing"],
  ["/categories/commercial-fridges", "listing"],
  ["/brands", "listing"],
  ["/brands/rational", "listing"],
  ["/brands/rational/combi-ovens", "listing"],
  ["/clearance", "listing"],
  ["/blog", "listing"],
  ["/products", "listing"],

  // Detail pages get the larger `page` budget — real browsing walks many.
  ["/products/rational-icombi-pro", "page"],
  ["/", "page"],
  ["/pages/about-us", "page"],
  ["/blog/how-to-choose-an-oven", "listing"],
  ["/render/cms/page", "page"],
];

for (const [path, expected] of CASES) {
  test(`classify ${path} -> ${expected}`, () => {
    assert.equal(classifySurface(path), expected);
  });
}

test("a trailing slash cannot dodge a tighter budget", () => {
  assert.equal(classifySurface("/search/"), "search");
  assert.equal(classifySurface("/api/search/"), "search");
});

test("a lookalike path does not inherit an exemption", () => {
  assert.notEqual(classifySurface("/api/healthcheck-probe"), "exempt");
  assert.notEqual(classifySurface("/api/testing"), "exempt");
});

test("every non-exempt class has a limit defined", () => {
  const classes: SurfaceClass[] = [
    "page",
    "listing",
    "search",
    "image",
    "api",
    "checkout",
    "sitemap",
  ];
  for (const c of classes) {
    const limit = SURFACE_LIMITS[c as Exclude<SurfaceClass, "exempt">];
    assert.ok(limit, `${c} has a limit`);
    assert.ok(limit.burstMax > 0 && limit.max > 0, `${c} limits are positive`);
    assert.ok(limit.max >= limit.burstMax, `${c} sustained cap >= burst cap`);
  }
});

test("search is the tightest page-facing budget, image the loosest", () => {
  // /search fans out into six Meilisearch queries; every image on every page
  // goes through /api/image.
  assert.ok(SURFACE_LIMITS.search.burstMax < SURFACE_LIMITS.listing.burstMax);
  assert.ok(SURFACE_LIMITS.image.burstMax > SURFACE_LIMITS.page.burstMax);
});
