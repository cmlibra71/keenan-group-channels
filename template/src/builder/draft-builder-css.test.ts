import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { draftBuilderCss, draftCssId } from "./draft-builder-css";

// Runs the REAL compiler (the `tailwind-builder-node` alias) — the point of the
// module is that a draft's never-published classes come out styled, inside the
// one sheet a publish would produce.

const tree = (classes: string[], children: unknown[] = []): NodeTree =>
  ({ v: 1, root: { id: "r", kind: "element", tag: "div", classes, children } }) as unknown as NodeTree;

const inventory = (extra: string[] = []) => ({
  classes: ["p-4", "text-ikb-ink", ...extra],
  theme_vars: { "--color-ikb-ink": "#1b1416", "--color-ikb-red": "#c8102e" },
});

test("no stored compile inputs → null (the published sheet stays)", async () => {
  assert.equal(await draftBuilderCss({ tree: tree(["bg-[#123457]"]) }), null);
});

test("every page class already in the inventory → null (published sheet is exact)", async () => {
  // collectPageBuilderClasses adds the safelists, which the portal's inventory always holds
  const { DISPLAY_SAFELIST, ISLAND_SAFELIST } = await import("@keenan/services/builder");
  const inv = inventory([...DISPLAY_SAFELIST, ...ISLAND_SAFELIST]);
  assert.equal(await draftBuilderCss({ tree: tree(["p-4"]), inputs: inv }), null);
});

test("a draft-only class → one sheet with the inventory AND the new class, stored theme applied", async () => {
  const css = await draftBuilderCss({ tree: tree(["bg-[#123457]", "lg:pt-[13px]", "text-ikb-red"]), inputs: inventory() });
  assert.ok(css);
  assert.match(css, /\[data-kg-nodes\] \.bg-\\\[\\#123457\\\]\s*\{[^}]*background-color/);
  assert.match(css, /@media[^{]*\{[^@]*\[data-kg-nodes\] \.lg\\:pt-\\\[13px\\\]/);
  assert.ok(css.includes(".p-4"), "inventory classes kept");
  assert.ok(css.includes(".text-ikb-ink"), "inventory site token generated from the stored theme");
  assert.ok(css.includes(".text-ikb-red"), "draft site token generated from the stored theme");
  assert.ok(!/\*,\s*::after/.test(css), "no preflight");
});

test("classes reached through a component master and a named style count as page classes", async () => {
  const page = tree([], [{ id: "c", kind: "component", componentKey: "card" }]);
  const css = await draftBuilderCss({
    tree: page,
    components: { card: tree(["mt-[7px]"]) },
    namedStyles: { "ik-btn": ["rounded-[3px]"] },
    inputs: inventory(),
  });
  assert.ok(css?.includes(".mt-\\[7px\\]"));
  assert.ok(css?.includes(".rounded-\\[3px\\]"));
});

test("same input → same (memoised) sheet; id is a content hash", async () => {
  const a = await draftBuilderCss({ tree: tree(["p-[11px]"]), inputs: inventory() });
  const b = await draftBuilderCss({ tree: tree(["p-[11px]"]), inputs: inventory() });
  assert.ok(a);
  assert.equal(a, b);
  assert.match(draftCssId(a), /^kg-draft-[0-9a-f]{16}$/);
});
