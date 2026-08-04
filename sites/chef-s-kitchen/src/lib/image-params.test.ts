import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseWidth,
  normaliseQuality,
  ALLOWED_WIDTHS,
  DEFAULT_QUALITY,
} from "./image-params.ts";

test("configured widths pass through unchanged", () => {
  for (const w of ALLOWED_WIDTHS) {
    assert.equal(normaliseWidth(String(w)), w);
  }
});

test("an unlisted width snaps UP to the next allowed one", () => {
  // Snap rather than reject: a broken image on a live storefront is worse than
  // a marginally oversized one.
  assert.equal(normaliseWidth("101"), 200);
  assert.equal(normaliseWidth("801"), 1024);
  assert.equal(normaliseWidth("1"), 100);
});

test("an oversized width is capped at the largest configured size", () => {
  // The whole amplification vector: `w` used to accept any value up to 3840,
  // so one source image could be made to cost 3,840 sharp encodes and 3,840
  // S3 objects.
  assert.equal(normaliseWidth("3840"), 1600);
  assert.equal(normaliseWidth("999999"), 1600);
});

test("the cache-key space is bounded to the configured widths", () => {
  const produced = new Set<number>();
  for (let w = 1; w <= 4000; w++) produced.add(normaliseWidth(String(w)));
  assert.equal(produced.size, ALLOWED_WIDTHS.length);
});

test("garbage and missing widths fall back to a sane default", () => {
  assert.equal(normaliseWidth("abc"), 800);
  assert.equal(normaliseWidth(null), 800);
  assert.equal(normaliseWidth(""), 800);
  assert.equal(normaliseWidth("-100"), 800);
});

test("the quality the loader actually sends is preserved", () => {
  assert.equal(normaliseQuality("80"), 80);
});

test("quality snaps into the allowed set and is bounded", () => {
  assert.equal(normaliseQuality("100"), 90);
  assert.equal(normaliseQuality("1"), 60);
  assert.equal(normaliseQuality("abc"), DEFAULT_QUALITY);
});

test("quality cannot expand the cache-key space", () => {
  const produced = new Set<number>();
  for (let q = 1; q <= 100; q++) produced.add(normaliseQuality(String(q)));
  assert.ok(produced.size <= 4, `expected <=4 distinct qualities, got ${produced.size}`);
});
