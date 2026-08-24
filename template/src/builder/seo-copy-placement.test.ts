import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { treePlacesSeoCopy } from "./seo-copy-placement";

// ============================================================================
// Card nYxPgpvK. The storefront's own approved category-page wording can now be
// PLACED by the Category Page Template (`category.seo_intro_html`), instead of
// only ever printing at the foot of the page.
//
// This is the test that stops the page printing it TWICE. The route keeps its
// foot block unless the tree places the copy itself; a page carrying the same
// paragraphs in its header and again at its foot is worse than a page that
// cannot move them, because duplicated body copy across 4,231 category pages is
// exactly the cannibalisation this content exists to avoid.
// ============================================================================

const tree = (root: unknown): NodeTree => ({ v: 1, root } as unknown as NodeTree);

const leaf = (extra: Record<string, unknown> = {}) => ({
  id: "n-leaf",
  kind: "element",
  tag: "div",
  classes: [],
  ...extra,
});

const page = (child: unknown): NodeTree =>
  tree({ id: "n-root", kind: "element", tag: "div", classes: [], children: [child] });

test("a tree that binds the copy owns it", () => {
  assert.equal(
    treePlacesSeoCopy(page(leaf({ richBinding: "category.seo_intro_html" }))),
    true
  );
});

test("a tree that does not bind it leaves the foot block alone", () => {
  // The header description is a DIFFERENT binding and must not be mistaken for
  // this one — every category page on Industry Kitchens carries it today, so a
  // loose match would silently strip the foot block from every page at once.
  assert.equal(
    treePlacesSeoCopy(page(leaf({ richBinding: "category.description_intro" }))),
    false
  );
});

test("no tree at all is not a placement", () => {
  assert.equal(treePlacesSeoCopy(null), false);
  assert.equal(treePlacesSeoCopy(undefined), false);
  assert.equal(treePlacesSeoCopy({ v: 1 } as unknown as NodeTree), false);
});

test("a node inside a shared component master counts as placed", () => {
  // The page tree holds only the component's KEY, so a check that read the page
  // tree alone would print the copy twice for anyone who wrapped it up as a
  // reusable block — which is the normal way to reuse one on this builder.
  const components = {
    "category-copy": page(leaf({ richBinding: "category.seo_intro_html" })),
  };
  const pageTree = page({
    id: "n-cmp",
    kind: "component",
    componentKey: "category-copy",
  });
  assert.equal(treePlacesSeoCopy(pageTree, components), true);
  assert.equal(treePlacesSeoCopy(pageTree, {}), false);
});

test("a condition or a text binding on the path counts too", () => {
  // The palette's node gates itself on the same path, and an author may bind it
  // as text rather than rich HTML. Either way the copy is on the page.
  assert.equal(
    treePlacesSeoCopy(
      page(leaf({ condition: { kind: "data", path: "category.seo_intro_html" } }))
    ),
    true
  );
  assert.equal(
    treePlacesSeoCopy(
      page(leaf({ text: [{ kind: "binding", path: "category.seo_intro_html" }] }))
    ),
    true
  );
});
