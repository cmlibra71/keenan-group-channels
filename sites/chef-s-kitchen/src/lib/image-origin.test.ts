import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedImageUrl, isFetchableImageUrl, isOwnSiteImageUrl } from "./image-origin.ts";

const ZOEY_OK =
  "https://zcom-media.s3.amazonaws.com/sites/a0i0L00000VH4TSQA1/media/catalog/product";

test("our own buckets are allowed wholesale", () => {
  assert.equal(
    isAllowedImageUrl("https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/anything/x.webp"),
    true
  );
  assert.equal(
    isAllowedImageUrl("https://keenan-portal-assets.s3.ap-southeast-2.amazonaws.com/a/b.png"),
    true
  );
});

test("a Zoey variant photograph under OUR site's media prefix is allowed", () => {
  // The two products card 0CDcCYmO's test matrix names.
  assert.equal(
    isAllowedImageUrl(`${ZOEY_OK}/s/k/sko-pg11.ubr.2.sd.lh.2dr.2dr_compressed.png`),
    true
  );
  assert.equal(isAllowedImageUrl(`${ZOEY_OK}/1/_/1_source_1581015095_compressed.jpg`), true);
});

test("the rest of Zoey's SHARED bucket is refused", () => {
  // `zcom-media` is multi-tenant: our objects live under one site id, other Zoey tenants' under
  // theirs. `/api/image` is a public unauthenticated GET that caches what it fetches into our own
  // bucket and serves it from our domain, so a host-only allowlist entry here would let anyone
  // launder any object in Zoey's bucket through chefsdepot.com.au.
  assert.equal(
    isAllowedImageUrl("https://zcom-media.s3.amazonaws.com/sites/b1OtherTenant/media/catalog/product/x.png"),
    false
  );
  assert.equal(isAllowedImageUrl("https://zcom-media.s3.amazonaws.com/anything.png"), false);
  assert.equal(
    isAllowedImageUrl(
      "https://zcom-media.s3.amazonaws.com/sites/a0i0L00000VH4TSQA1/media/catalog/category/x.png"
    ),
    false
  );
  // The prefix ends in a slash, so it cannot be satisfied by a longer sibling segment.
  assert.equal(
    isAllowedImageUrl(
      "https://zcom-media.s3.amazonaws.com/sites/a0i0L00000VH4TSQA1/media/catalog/productEVIL/x.png"
    ),
    false
  );
});

test("traversal cannot climb out of the pinned prefix", () => {
  // `URL` resolves dot segments (percent-encoded ones included) during parsing, so `pathname` is
  // already normalised before the prefix test sees it.
  assert.equal(isAllowedImageUrl(`${ZOEY_OK}/../../../../other/x.png`), false);
  assert.equal(isAllowedImageUrl(`${ZOEY_OK}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/other/x.png`), false);
});

test("plain http is refused on every entry", () => {
  assert.equal(isAllowedImageUrl(`${ZOEY_OK}/s/k/x.png`.replace("https:", "http:")), false);
  assert.equal(
    isAllowedImageUrl("http://keenan-group-images.s3.ap-southeast-2.amazonaws.com/x.png"),
    false
  );
});

test("look-alike and path-style hosts are refused", () => {
  assert.equal(isAllowedImageUrl("https://evil.com/x.png"), false);
  // Path-style: the bucket is in the PATH, so every public bucket shares this hostname.
  assert.equal(
    isAllowedImageUrl(
      "https://s3.amazonaws.com/zcom-media/sites/a0i0L00000VH4TSQA1/media/catalog/product/x.png"
    ),
    false
  );
  assert.equal(
    isAllowedImageUrl(
      "https://zcom-media.s3.amazonaws.com.evil.com/sites/a0i0L00000VH4TSQA1/media/catalog/product/x.png"
    ),
    false
  );
});

test("a category tile image in our own bucket is still usable", () => {
  // CategoryTiles uses this same predicate to choose tile-vs-grey-placeholder (sf-catalog-browse,
  // cards LrRNJiEY + gRLRF8yu). Adding the Zoey entry must not change that decision for any
  // category image, and it cannot: no category image lives under Zoey's PRODUCT media prefix.
  assert.equal(
    isAllowedImageUrl(
      "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/categories/refrigeration.jpg"
    ),
    true
  );
  assert.equal(
    isAllowedImageUrl("https://zcom-media.s3.amazonaws.com/media/catalog/category/fridges.jpg"),
    false
  );
});

test("garbage is refused rather than thrown", () => {
  assert.equal(isAllowedImageUrl("not a url"), false);
  assert.equal(isAllowedImageUrl(""), false);
});

// ---------------------------------------------------------------------------
// Card HPgTV0Ck — a file the SITE ITSELF serves is fetchable by /api/image.
// `isAllowedImageUrl` is unchanged by this: it is the "is this picture usable?"
// test the category tiles and the brand-logo fallback run in the BROWSER, where
// SITE_URL does not exist, so it has to stay a pure function of the URL.
// ---------------------------------------------------------------------------

function withSiteUrl(value: string | undefined, fn: () => void) {
  const before = process.env.SITE_URL;
  if (value === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = before;
  }
}

test("a file on the site's own origin is fetchable, but is not on the bucket allow-list", () => {
  withSiteUrl("https://chefsdepot.com.au", () => {
    // Steve's SilverChef logo: public/silverchef-logo.png, authored by absolute address.
    assert.equal(isOwnSiteImageUrl("https://chefsdepot.com.au/silverchef-logo.png"), true);
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au/silverchef-logo.png"), true);
    // The browser-side "usable" predicate is deliberately untouched.
    assert.equal(isAllowedImageUrl("https://chefsdepot.com.au/silverchef-logo.png"), false);
  });
});

test("the site's own origin must match exactly — no other host, scheme or subdomain", () => {
  withSiteUrl("https://chefsdepot.com.au", () => {
    assert.equal(isFetchableImageUrl("https://www.chefsdepot.com.au/silverchef-logo.png"), false);
    assert.equal(isFetchableImageUrl("http://chefsdepot.com.au/silverchef-logo.png"), false);
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au.evil.com/x.png"), false);
    assert.equal(isFetchableImageUrl("https://industrykitchens.com.au/x.png"), false);
    assert.equal(isFetchableImageUrl("https://evil.com/x.png"), false);
  });
});

test("the optimizer will not fetch its own routes — no self-recursion", () => {
  withSiteUrl("https://chefsdepot.com.au", () => {
    assert.equal(
      isFetchableImageUrl("https://chefsdepot.com.au/api/image?url=https%3A%2F%2Fchefsdepot.com.au%2Fa.png&w=1600&q=80"),
      false
    );
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au/api/hero-atlas"), false);
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au/api"), false);
    // …and a path that merely BEGINS with the letters is still a real file.
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au/apibanner.png"), true);
  });
});

test("with no SITE_URL set, the own-origin rule allows nothing", () => {
  withSiteUrl(undefined, () => {
    assert.equal(isOwnSiteImageUrl("https://chefsdepot.com.au/silverchef-logo.png"), false);
    assert.equal(isFetchableImageUrl("https://chefsdepot.com.au/silverchef-logo.png"), false);
    // The buckets still are.
    assert.equal(
      isFetchableImageUrl("https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/x.webp"),
      true
    );
  });
});
