import test from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import { draftBuilderCss, draftCssId } from "./draft-builder-css";

// Runs the REAL compiler (the `tailwind-builder-node` alias) — the point of the
// module is that a draft's never-published classes come out styled.

const tree = (classes: string[], children: unknown[] = []): NodeTree =>
  ({ v: 1, root: { id: "r", kind: "element", tag: "div", classes, children } }) as unknown as NodeTree;

test("a draft-only class compiles, scoped to the node region", async () => {
  const css = await draftBuilderCss({ tree: tree(["bg-[#123457]", "lg:pt-[13px]"]) });
  assert.match(css, /\[data-kg-nodes\] \.bg-\\\[\\#123457\\\]\s*\{[^}]*background-color/);
  assert.match(css, /@media[^{]*\{[^@]*\[data-kg-nodes\] \.lg\\:pt-\\\[13px\\\]/);
  assert.ok(!/\*,\s*::after/.test(css), "no preflight");
});

test("classes reached through a component master and a named style compile too", async () => {
  const page = tree([], [{ id: "c", kind: "component", componentKey: "card" }]);
  const css = await draftBuilderCss({
    tree: page,
    components: { card: tree(["mt-[7px]"]) },
    namedStyles: { "ik-btn": ["rounded-[3px]"] },
  });
  assert.ok(css.includes(".mt-\\[7px\\]"));
  assert.ok(css.includes(".rounded-\\[3px\\]"));
});

test("the stored publish theme seeds the compiler (site tokens generate)", async () => {
  const without = await draftBuilderCss({ tree: tree(["text-ikb-red"]) });
  assert.ok(!without.includes(".text-ikb-red"), "unknown token → no rule");
  const withTheme = await draftBuilderCss({
    tree: tree(["text-ikb-red"]),
    published: { css: "", theme_vars: { "--color-ikb-red": "#c8102e" } },
  });
  assert.ok(withTheme.includes(".text-ikb-red"));
});

test("same input → same (memoised) sheet; id is a content hash", async () => {
  const a = await draftBuilderCss({ tree: tree(["p-[11px]"]) });
  const b = await draftBuilderCss({ tree: tree(["p-[11px]"]) });
  assert.equal(a, b);
  assert.match(draftCssId(a), /^kg-draft-[0-9a-f]{16}$/);
});
