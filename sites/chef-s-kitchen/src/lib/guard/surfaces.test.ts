import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyActionSurface,
  classifySurface,
  isCredentialPath,
  isPagedSearchRequest,
  SURFACE_LIMITS,
  type SurfaceClass,
} from "./surfaces.ts";
import {
  MAX_SUGGESTIONS,
  SUGGESTIONS_PER_PAGE,
  suggestionRequestUrl,
} from "../search-suggestions.ts";

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

test("a server action on an ordinary page path is charged to the api budget", () => {
  assert.equal(classifyActionSurface("/checkout"), "api");
  assert.equal(classifyActionSurface("/cart"), "api");
  assert.equal(classifyActionSurface("/products/some-oven"), "api");
  assert.equal(classifyActionSurface("/categories/combi-ovens"), "api");
});

test("a server action on /search stays on the SEARCH budget", () => {
  // The search feed's load-more is a server action doing the same Meilisearch
  // work the page does. Charging it to `api` would give catalogue enumeration a
  // door 8x wider than the one the search budget deliberately holds shut.
  assert.equal(classifyActionSurface("/search"), "search");
  assert.equal(classifyActionSurface("/search/"), "search");
  assert.ok(SURFACE_LIMITS.api.burstMax > SURFACE_LIMITS.search.burstMax);
  assert.ok(SURFACE_LIMITS.api.max > SURFACE_LIMITS.search.max);
});

test("an action on an exempt path stays exempt", () => {
  assert.equal(classifyActionSurface("/api/revalidate"), "exempt");
});

test("search is the tightest page-facing budget, image the loosest", () => {
  // /search fans out into six Meilisearch queries; every image on every page
  // goes through /api/image.
  assert.ok(SURFACE_LIMITS.search.burstMax < SURFACE_LIMITS.listing.burstMax);
  assert.ok(SURFACE_LIMITS.image.burstMax > SURFACE_LIMITS.page.burstMax);
});

// ── Credential paths (POST-only, checked by lib/guard/index.ts) ─────────────

test("isCredentialPath covers the sign-in, account, checkout and membership paths", () => {
  for (const path of [
    "/account",
    "/account/",
    "/account/register",
    "/account/forgot-password",
    "/account/reset-password/abc123",
    "/account/security",
    "/checkout",
    "/checkout/confirmation",
    "/membership",
  ]) {
    assert.equal(isCredentialPath(path), true, path);
  }
});

test("isCredentialPath leaves ordinary shopping paths alone", () => {
  for (const path of [
    "/",
    "/cart",
    "/products/combi-oven",
    "/categories/refrigeration",
    "/search",
    "/api/search",
    "/accounts-payable",
  ]) {
    assert.equal(isCredentialPath(path), false, path);
  }
});

test("the credential budget is far above a human and below a stuffing run", () => {
  const limit = SURFACE_LIMITS.credential;
  assert.ok(limit.burstMax >= 10, "a shopper retrying a form must not trip it");
  assert.ok(limit.max <= 100, "must still be reachable by an attacker in minutes");
});

// ── The header suggestion dropdown's scroll load (G3gpxN0k) ────────────────

test("a later /api/search window is recognised as a scroll load", () => {
  assert.equal(isPagedSearchRequest("/api/search", "40"), true);
  assert.equal(isPagedSearchRequest("/api/search/", "280"), true, "trailing slash");
});

test("the FIRST window keeps its full weight", () => {
  // It is the request an enumerator repeats with a fresh query every time; a
  // deep page is worth nothing without it, so only the deep pages are discounted.
  assert.equal(isPagedSearchRequest("/api/search", null), false);
  assert.equal(isPagedSearchRequest("/api/search", "0"), false);
  assert.equal(isPagedSearchRequest("/api/search", ""), false);
  assert.equal(isPagedSearchRequest("/api/search", "-40"), false);
  assert.equal(isPagedSearchRequest("/api/search", "abc"), false);
});

test("the discount reaches no path but /api/search", () => {
  for (const path of ["/search", "/api/address/suggest", "/categories/ovens", "/", "/api"]) {
    assert.equal(isPagedSearchRequest(path, "40"), false, path);
  }
});

test("a full scroll of the dropdown cannot rate-limit itself", () => {
  // Eight requests against a burst allowance of eight is exactly the failure
  // the discount exists to stop, so this asserts the arithmetic, not the intent.
  const CHUNK_WEIGHT = 1 / 3; // SEARCH_CHUNK_WEIGHT in ./index.ts
  let spent = 0;
  for (let offset = 0; offset < MAX_SUGGESTIONS; offset += SUGGESTIONS_PER_PAGE) {
    const query = suggestionRequestUrl("oven", offset).split("?")[1];
    const offsetRaw = new URLSearchParams(query).get("offset");
    spent += isPagedSearchRequest("/api/search", offsetRaw) ? CHUNK_WEIGHT : 1;
  }
  assert.ok(spent < SURFACE_LIMITS.search.burstMax, `spent ${spent}`);
  assert.ok(spent > 3 && spent < 4, `one full walk should cost ~3.3, got ${spent}`);
});

test("the discounted surface is still the tightest on the site", () => {
  // The relaxation is recorded with its arithmetic in the behaviour register.
  // If either budget moves, this is the check that should fail first.
  const CHUNK_WEIGHT = 1 / 3;
  const searchRows = (SURFACE_LIMITS.search.max / CHUNK_WEIGHT) * 50; // MAX_LIMIT
  const listingRows = SURFACE_LIMITS.listing.max * 24 * 8; // cumulative category page
  assert.ok(searchRows < listingRows, `${searchRows} must stay under ${listingRows}`);
});
