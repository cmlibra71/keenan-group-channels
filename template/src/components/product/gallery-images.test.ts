import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGalleryImages,
  isShowingVariant,
  galleryImageKey,
  VARIANT_IMAGE_ID,
  type GalleryImage,
} from "./gallery-images";

// The FIFO Bottle Portion Pal Kit (product 10750) as it renders live: two parent
// photographs, and 22 variants each carrying their own picture.
const PARENT: GalleryImage[] = [
  {
    id: 41001,
    urlStandard: "https://img.example/products/15574/0.jpg",
    urlThumbnail: "https://img.example/products/15574/0-t.jpg",
    urlZoom: null,
    altText: "FIFO Bottle Portion Pal Kit",
    isThumbnail: true,
  },
  {
    id: 41002,
    urlStandard: "https://img.example/products/15574/1.jpg",
    urlThumbnail: null,
    urlZoom: null,
    altText: "What's in the kit",
    isThumbnail: null,
  },
];

const VARIANT_24OZ = "https://zcom-media.example/1/6/16_source.jpg";

test("no pick shows the product's own gallery, untouched", () => {
  const out = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: null,
    productName: "FIFO Bottle Portion Pal Kit",
  });
  assert.deepEqual(out, PARENT);
  assert.equal(isShowingVariant(out), false);
});

test("a resolved variation REPLACES the gallery — the parent's photos step aside", () => {
  const out = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: VARIANT_24OZ,
    productName: "FIFO Bottle Portion Pal Kit",
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].urlStandard, VARIANT_24OZ);
  assert.equal(out[0].id, VARIANT_IMAGE_ID);
  assert.equal(isShowingVariant(out), true);
  // Hero, strip and zoom all read this list, so every surface agrees.
  assert.equal(out[0].urlThumbnail, VARIANT_24OZ);
  assert.equal(out[0].urlZoom, VARIANT_24OZ);
  assert.equal(out[0].altText, "FIFO Bottle Portion Pal Kit");
});

test("changing the pick swaps to the new variation, still alone", () => {
  const other = "https://zcom-media.example/1/5/15_source.jpg";
  const out = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: other,
    productName: "FIFO Bottle Portion Pal Kit",
  });
  assert.deepEqual(
    out.map((i) => i.urlStandard),
    [other],
  );
});

test("clearing every select restores the product gallery exactly", () => {
  const picked = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: VARIANT_24OZ,
    productName: "Kit",
  });
  assert.equal(picked.length, 1);
  const cleared = resolveGalleryImages({ images: PARENT, variantImageUrl: null, productName: "Kit" });
  assert.deepEqual(cleared, PARENT);
});

test("a variation whose FILE is dead hands the product gallery back", () => {
  const broken = new Set([galleryImageKey({ ...PARENT[0], id: VARIANT_IMAGE_ID, urlStandard: VARIANT_24OZ })]);
  const out = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: VARIANT_24OZ,
    productName: "Kit",
    brokenKeys: broken,
  });
  assert.deepEqual(out, PARENT);
  assert.equal(isShowingVariant(out), false);
});

test("a broken PARENT image is still dropped when no variation is picked", () => {
  const out = resolveGalleryImages({
    images: PARENT,
    variantImageUrl: null,
    productName: "Kit",
    brokenKeys: new Set([galleryImageKey(PARENT[0])]),
  });
  assert.deepEqual(
    out.map((i) => i.id),
    [41002],
  );
});

test("a product with no images and no pick stays empty", () => {
  assert.deepEqual(
    resolveGalleryImages({ images: [], variantImageUrl: null, productName: "Kit" }),
    [],
  );
});

test("a variation picture shows even on a product carrying no photos of its own", () => {
  const out = resolveGalleryImages({ images: [], variantImageUrl: VARIANT_24OZ, productName: "Kit" });
  assert.equal(out.length, 1);
  assert.equal(out[0].urlStandard, VARIANT_24OZ);
});

test("image keys separate the variant stand-in from real rows", () => {
  assert.equal(galleryImageKey(PARENT[0]), "img:41001");
  assert.equal(
    galleryImageKey({ ...PARENT[0], id: VARIANT_IMAGE_ID, urlStandard: VARIANT_24OZ }),
    `variant:${VARIANT_24OZ}`,
  );
});
