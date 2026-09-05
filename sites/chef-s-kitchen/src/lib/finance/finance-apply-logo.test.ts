import test from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode, ElementNode, NodeTree } from "@keenan/services/builder";
import { financeApplyPageTree } from "@keenan/services/finance";
import {
  FINANCE_APPLY_LOGOS,
  FINANCE_APPLY_LOGO_NODE_ID,
  financeApplyFunderForSlug,
  withFinanceApplyLogo,
} from "./finance-apply-logo.ts";

function flatten(node: BuilderNode): BuilderNode[] {
  const kids =
    node.kind === "element"
      ? (node.children ?? [])
      : node.kind === "repeat"
        ? [...(node.children ?? []), ...(node.emptyChildren ?? [])]
        : [];
  return [node, ...kids.flatMap(flatten)];
}

const images = (tree: NodeTree) =>
  flatten(tree.root).filter(
    (n): n is ElementNode => n.kind === "element" && n.tag === "img"
  );

const el = (tag: string, children: BuilderNode[] = []): ElementNode => ({
  id: tag,
  kind: "element",
  tag,
  children,
});

test("the slug decides the financier, and nothing else gets a logo", () => {
  assert.equal(financeApplyFunderForSlug("silverchef-apply"), "silverchef");
  assert.equal(financeApplyFunderForSlug("skope-funding-apply"), "skope");
  // Every other content page on the storefront must gain nothing.
  assert.equal(financeApplyFunderForSlug("silverchef"), null);
  assert.equal(financeApplyFunderForSlug("skope-finance"), null);
  assert.equal(financeApplyFunderForSlug("terms"), null);
});

test("each apply page carries ITS OWN mark and never the other financier's", () => {
  // Card XlDVUsuC + Steve 2026-08-20: a customer may never be handed to the
  // wrong financier, so the wrong logo is worse than no logo.
  for (const funder of ["silverchef", "skope"] as const) {
    const other = funder === "silverchef" ? "skope" : "silverchef";
    const placed = withFinanceApplyLogo(financeApplyPageTree(funder), funder);
    const srcs = images(placed).map((n) => (n.attrs?.src as { value: string }).value);
    assert.deepEqual(srcs, [FINANCE_APPLY_LOGOS[funder].src]);
    assert.ok(!srcs.some((s) => s === FINANCE_APPLY_LOGOS[other].src));
  }
});

test("the logo sits at the top of the header, above the heading, with alt text naming the financier", () => {
  const placed = withFinanceApplyLogo(financeApplyPageTree("silverchef"), "silverchef");
  const header = flatten(placed.root).find(
    (n): n is ElementNode => n.kind === "element" && n.tag === "header"
  );
  assert.ok(header, "the seeded apply page has a header");
  const first = header.children?.[0] as ElementNode;
  assert.equal(first.tag, "img");
  assert.equal(first.id, FINANCE_APPLY_LOGO_NODE_ID);
  assert.equal((first.attrs?.alt as { value: string }).value, "SilverChef");
  // …and above the H1, which is what "masthead" means here.
  const tags = (header.children ?? []).map((c) => (c.kind === "element" ? c.tag : c.kind));
  assert.ok(tags.indexOf("img") < tags.indexOf("h1"));
});

test("Skope's alt text names Skope Funding", () => {
  const placed = withFinanceApplyLogo(financeApplyPageTree("skope"), "skope");
  const [img] = images(placed);
  assert.equal((img.attrs?.alt as { value: string }).value, "Skope Funding");
});

test("the stored tree is never mutated", () => {
  const tree = financeApplyPageTree("silverchef");
  const before = JSON.stringify(tree);
  withFinanceApplyLogo(tree, "silverchef");
  assert.equal(JSON.stringify(tree), before);
});

test("running twice adds one logo, not two", () => {
  const once = withFinanceApplyLogo(financeApplyPageTree("skope"), "skope");
  const twice = withFinanceApplyLogo(once, "skope");
  assert.equal(images(twice).length, 1);
  assert.equal(twice, once, "an already-placed tree comes back untouched");
});

const authoredLogo = (src: string, alt = ""): NodeTree => ({
  v: 1,
  root: el("div", [
    el("header", [
      {
        id: "their-own-node",
        kind: "element",
        tag: "img",
        attrs: { src: { kind: "static", value: src }, alt: { kind: "static", value: alt } },
      },
      el("h1"),
    ]),
  ]),
});

test("a staff member who places the picture themselves wins", () => {
  // This is Chefs Depot's live SilverChef apply page: a full-width
  // `silverchef-logo.png` placed in the page editor, alt text left empty. We
  // must not stack a second SilverChef mark above it.
  const authored = authoredLogo("https://chefsdepot.com.au/silverchef-logo.png");
  const placed = withFinanceApplyLogo(authored, "silverchef");
  assert.equal(placed, authored);
  assert.equal(images(placed).length, 1);
});

test("an image recognised only by its alt text also counts as theirs", () => {
  const authored = authoredLogo("https://assets.example/9f3a1c.png", "Skope Funding");
  assert.equal(withFinanceApplyLogo(authored, "skope"), authored);
});

test("the OTHER financier's picture never stands in for this page's mark", () => {
  // A Skope image on the SilverChef page is a fault to see, not a reason to
  // leave the page with no SilverChef mark (Steve, 2026-08-20).
  const authored = authoredLogo("https://chefsdepot.com.au/finance/skope-funding.jpg", "Skope Funding");
  const placed = withFinanceApplyLogo(authored, "silverchef");
  const srcs = images(placed).map((n) => (n.attrs?.src as { value: string }).value);
  assert.ok(srcs.includes(FINANCE_APPLY_LOGOS.silverchef.src));
});

test("a reshaped page with no header still gets its logo above the heading", () => {
  const reshaped: NodeTree = { v: 1, root: el("div", [el("section", [el("h1"), el("form")])]) };
  const placed = withFinanceApplyLogo(reshaped, "silverchef");
  const section = flatten(placed.root).find(
    (n): n is ElementNode => n.kind === "element" && n.tag === "section"
  );
  assert.equal((section?.children?.[0] as ElementNode).tag, "img");
});

test("a tree with neither header nor h1 still shows the logo rather than losing it", () => {
  const odd: NodeTree = { v: 1, root: el("div", [el("p")]) };
  const placed = withFinanceApplyLogo(odd, "skope");
  assert.equal(images(placed).length, 1);
  assert.equal(((placed.root as ElementNode).children?.[0] as ElementNode).tag, "img");
});
