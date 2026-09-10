import { test } from "node:test";
import assert from "node:assert/strict";
import {
  usableImageUrls,
  orderSummaryImagesForProducts,
  type PrimaryImageReader,
} from "./order-summary-images.ts";

const OURS = "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/p/1.jpg";
const THEIRS = "https://example.invalid/p/1.jpg";

/** A reader that records what it was asked for, so "no read at all" is observable. */
function reader(rows: Array<[number, string]>) {
  const calls: number[][] = [];
  const read: PrimaryImageReader = async (ids) => {
    calls.push(ids);
    return new Map(rows);
  };
  return { read, calls };
}

// ── usableImageUrls (pure) ──────────────────────────────────────────────────

test("usableImageUrls keeps a URL /api/image is allowed to fetch", () => {
  const out = usableImageUrls(new Map([[1, OURS]]));
  assert.deepEqual([...out], [[1, OURS]]);
});

test("usableImageUrls drops a URL off the allow-list", () => {
  const out = usableImageUrls(new Map([[1, THEIRS], [2, OURS]]));
  assert.deepEqual([...out], [[2, OURS]]);
});

test("usableImageUrls drops an empty-string URL without asking the predicate", () => {
  let asked = 0;
  const out = usableImageUrls(new Map([[1, ""]]), () => {
    asked += 1;
    return true;
  });
  assert.equal(out.size, 0);
  assert.equal(asked, 0);
});

// ── orderSummaryImagesForProducts ───────────────────────────────────────────

test("an empty id list short-circuits without reading anything", async () => {
  const { read, calls } = reader([[1, OURS]]);
  const out = await orderSummaryImagesForProducts([], read);
  assert.equal(out.size, 0);
  assert.deepEqual(calls, []);
});

test("a list of only unusable ids also short-circuits without reading", async () => {
  const { read, calls } = reader([[1, OURS]]);
  const out = await orderSummaryImagesForProducts([0, -3, NaN, 1.5], read);
  assert.equal(out.size, 0);
  assert.deepEqual(calls, []);
});

test("duplicate, zero, negative and NaN ids are filtered before the read", async () => {
  const { read, calls } = reader([[7, OURS]]);
  await orderSummaryImagesForProducts([7, 7, 0, -1, NaN, 9], read);
  assert.deepEqual(calls, [[7, 9]]);
});

test("a product with no usable picture is simply absent from the map", async () => {
  const { read } = reader([[7, THEIRS], [9, OURS]]);
  const out = await orderSummaryImagesForProducts([7, 9], read);
  assert.deepEqual([...out], [[9, OURS]]);
});

test("a throwing reader returns an empty map rather than propagating", async () => {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const out = await orderSummaryImagesForProducts([1], async () => {
      throw new Error("db down");
    });
    assert.equal(out.size, 0);
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});
