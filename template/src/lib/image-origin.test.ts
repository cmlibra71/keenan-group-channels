import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedImageUrl } from "./image-origin.ts";

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
