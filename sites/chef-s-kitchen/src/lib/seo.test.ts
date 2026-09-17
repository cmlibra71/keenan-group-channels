import test from "node:test";
import assert from "node:assert/strict";
import { categoryRobots, isIndexable, siteRobots } from "./seo";

// SITE_INDEXABLE is read at call time, so each test sets it and puts it back.
function withIndexable<T>(value: string | undefined, fn: () => T): T {
  const before = process.env.SITE_INDEXABLE;
  if (value === undefined) delete process.env.SITE_INDEXABLE;
  else process.env.SITE_INDEXABLE = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.SITE_INDEXABLE;
    else process.env.SITE_INDEXABLE = before;
  }
}

test("indexability is opt-in and only the exact string counts", () => {
  withIndexable("true", () => assert.equal(isIndexable(), true));
  withIndexable("TRUE", () => assert.equal(isIndexable(), false));
  withIndexable("1", () => assert.equal(isIndexable(), false));
  withIndexable(undefined, () => assert.equal(isIndexable(), false));
});

test("a site that is not indexable says noindex, nofollow site-wide", () => {
  withIndexable(undefined, () =>
    assert.deepEqual(siteRobots(), { index: false, follow: false })
  );
});

test("an indexable site emits no robots meta at all — Chefs Depot today", () => {
  withIndexable("true", () => assert.equal(siteRobots(), undefined));
});

test("a category kept out of search says so on any site", () => {
  const hidden = { include_in_search: false };
  withIndexable("true", () =>
    assert.deepEqual(categoryRobots(hidden), { index: false, follow: true })
  );
  withIndexable(undefined, () =>
    assert.deepEqual(categoryRobots(hidden), { index: false, follow: true })
  );
});

test("an ordinary category takes the SITE's answer, never a bare undefined", () => {
  // Next replaces the layout's robots when a page names the field at all, so
  // returning undefined here used to cancel the site-wide noindex.
  withIndexable(undefined, () => {
    assert.deepEqual(categoryRobots({ include_in_search: true }), { index: false, follow: false });
    assert.deepEqual(categoryRobots(null), { index: false, follow: false });
    assert.deepEqual(categoryRobots(undefined), { index: false, follow: false });
  });
  withIndexable("true", () => {
    assert.equal(categoryRobots({ include_in_search: true }), undefined);
    assert.equal(categoryRobots(null), undefined);
  });
});
