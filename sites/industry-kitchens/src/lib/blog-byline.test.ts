import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { blogByline } from "./blog-byline";

/**
 * Card nHVhkIR4. The blog list is shared template code and printed a hard-coded
 * "Industry Kitchens" under every post with no author — on Chefs Depot too.
 */
describe("blogByline", () => {
  test("the post's own author always wins", () => {
    assert.equal(blogByline("Tim Keenan", "Chefs Depot", "Chefs Depot"), "Tim Keenan");
  });

  test("an unsigned post is signed by THIS storefront", () => {
    assert.equal(blogByline(null, "Chefs Depot", "Chefs Depot"), "Chefs Depot");
    assert.equal(blogByline("", "Industry Kitchens", "Industry Kitchens"), "Industry Kitchens");
  });

  test("falls back to the channel name when the site row has none", () => {
    assert.equal(blogByline(null, null, "Chefs Depot"), "Chefs Depot");
    assert.equal(blogByline("  ", "   ", "Chefs Depot"), "Chefs Depot");
  });

  test("prints NO byline rather than the other business's name", () => {
    assert.equal(blogByline(null, null, null), null);
    assert.equal(blogByline("", "", ""), null);
  });

  test("a Chefs Depot page can never be signed Industry Kitchens", () => {
    // The exact defect: the fallback was the literal string, whatever site it ran on.
    assert.equal(blogByline(null, "Chefs Depot", "Chefs Depot"), "Chefs Depot");
    assert.notEqual(blogByline(null, "Chefs Depot", "Chefs Depot"), "Industry Kitchens");
  });
});
