import { test } from "node:test";
import assert from "node:assert/strict";
import { searchThumbnailSrc } from "./search-thumbnail";
import { IMAGE_URL_EPOCH } from "./image-loader";

// Review of card stH1U00j: the dropdown loaded the S3 original, which the ingest now overwrites in place
// and which carried a year-long max-age — a replaced photo stayed in the dropdown for a year.
test("an allowlisted product original goes through /api/image (versioned, revalidated, 100px)", () => {
  const original = "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/products/35780/0.jpg";
  assert.equal(
    searchThumbnailSrc(original),
    `/api/image?url=${encodeURIComponent(original)}&w=100&q=75&v=${IMAGE_URL_EPOCH}`,
  );
});

test("a URL /api/image would refuse is loaded as it is (never a broken thumbnail)", () => {
  assert.equal(searchThumbnailSrc("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(searchThumbnailSrc("http://keenan-group-images.s3.ap-southeast-2.amazonaws.com/p.jpg"), "http://keenan-group-images.s3.ap-southeast-2.amazonaws.com/p.jpg");
});
