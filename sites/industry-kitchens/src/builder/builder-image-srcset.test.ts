import test from "node:test";
import assert from "node:assert/strict";
import { responsiveImageAttrs } from "./builder-image-srcset";
import imageLoader from "../lib/image-loader";

// The widths <BuilderImage> uses — next.config.ts `images.deviceSizes`.
const WIDTHS = [1024, 1280, 1600];

test("every candidate is built with an explicit width — the loader is never called without one", () => {
  const seen: number[] = [];
  responsiveImageAttrs("https://s3/x.jpg", WIDTHS, ({ src, width }) => {
    seen.push(width);
    assert.equal(typeof width, "number");
    return `${src}?w=${width}`;
  });
  assert.deepEqual(seen, WIDTHS);
});

test("src is the largest candidate and srcSet carries w descriptors", () => {
  const attrs = responsiveImageAttrs("https://s3/x.jpg", WIDTHS, imageLoader);
  assert.equal(attrs.src, imageLoader({ src: "https://s3/x.jpg", width: 1600 }));
  assert.equal(
    attrs.srcSet,
    WIDTHS.map((w) => `${imageLoader({ src: "https://s3/x.jpg", width: w })} ${w}w`).join(", ")
  );
});

test("quality rides through to every candidate", () => {
  const attrs = responsiveImageAttrs("https://s3/x.jpg", WIDTHS, imageLoader, 90);
  assert.ok(attrs.srcSet?.includes("q=90"));
  assert.ok(!attrs.srcSet?.includes("q=80"));
});

test("a src the loader passes through untouched gets no srcSet", () => {
  for (const src of ["/brand/logo.png", "data:image/gif;base64,AAAA"]) {
    const attrs = responsiveImageAttrs(src, WIDTHS, imageLoader);
    assert.equal(attrs.src, src);
    assert.equal(attrs.srcSet, undefined);
  }
});
