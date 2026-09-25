import { test } from "node:test";
import assert from "node:assert/strict";
import imageLoader, { IMAGE_URL_EPOCH } from "./image-loader";

// Cards stH1U00j + L1gFfhko. Until 2026-09 every /api/image response was `immutable` for a year, so
// a browser that had already seen a photo never asked for it again after it was replaced. The epoch
// parameter gives every image a URL no browser has cached.
test("routes remote images through /api/image with the cache-busting epoch", () => {
  const url = imageLoader({ src: "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/products/35780/0.jpg", width: 800 });
  assert.equal(
    url,
    `/api/image?url=${encodeURIComponent("https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/products/35780/0.jpg")}&w=800&q=80&v=${IMAGE_URL_EPOCH}`
  );
  assert.ok(IMAGE_URL_EPOCH >= 2, "the epoch must stay above the value every pre-fix URL carried (none)");
});

test("leaves relative paths and data URLs alone", () => {
  assert.equal(imageLoader({ src: "/logo.png", width: 200 }), "/logo.png");
  assert.equal(imageLoader({ src: "data:image/png;base64,AA", width: 200 }), "data:image/png;base64,AA");
});
