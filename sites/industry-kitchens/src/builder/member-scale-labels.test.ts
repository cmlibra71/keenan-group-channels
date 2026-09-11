import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree, BuilderNode } from "@keenan/services/builder";

import { withMemberScaleLabels, withMemberScaleLabelsInTree, STANDARD_PRICE_LABEL } from "./member-scale-labels";

/**
 * The LIVE Chefs Depot `price-panel` master's price row (`cms_components`,
 * channel 2, read read-only from production on 2026-09-11), trimmed to the
 * nodes that carry wording. Node ids are production's.
 */
function pricePanel(): NodeTree {
  return {
    v: 1,
    root: {
      id: "price-panel-x1",
      kind: "element",
      tag: "div",
      children: [
        {
          id: "price-row-x6",
          kind: "element",
          tag: "div",
          children: [
            { id: "price-big-x7", kind: "element", tag: "span", text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.priceDisplay" }] },
            { id: "price-rrp-label-x24", kind: "element", tag: "span", text: [{ kind: "static", value: "RRP" }] },
          ],
        },
        {
          id: "rrp-line-x13",
          kind: "element",
          tag: "p",
          children: [
            { id: "rrp-label-x14", kind: "element", tag: "span", text: [{ kind: "static", value: "RRP " }] },
            { id: "rrp-strike-x15", kind: "element", tag: "s", text: [{ kind: "static", value: "$" }, { kind: "binding", path: "purchase.rrpDisplay" }] },
            {
              id: "rrp-save-x17",
              kind: "element",
              tag: "b",
              text: [
                { kind: "static", value: "You save $" },
                { kind: "binding", path: "purchase.saveAmount" },
                { kind: "static", value: " (" },
                { kind: "binding", path: "purchase.savePct" },
                { kind: "static", value: "%)" },
              ],
            },
          ],
        },
        {
          id: "member-teaser-x25",
          kind: "element",
          tag: "div",
          children: [
            { id: "teaser-copy-a-x27", kind: "element", tag: "span", text: [{ kind: "static", value: "Members save up to " }] },
            { id: "teaser-copy-b-x28", kind: "element", tag: "b", text: [{ kind: "binding", path: "purchase.memberSavingsPct" }, { kind: "static", value: "%" }] },
          ],
        },
      ],
    },
  } as unknown as NodeTree;
}

/** The listing tile's `price-block` master: the member saving line and the sale badge. */
function priceBlock(): NodeTree {
  return {
    v: 1,
    root: {
      id: "div-cseed-210",
      kind: "element",
      tag: "div",
      children: [
        { id: "card-rrp-label-x42", kind: "element", tag: "span", text: [{ kind: "static", value: "RRP" }] },
        {
          id: "span-cseed-207",
          kind: "element",
          tag: "span",
          text: [
            { kind: "static", value: "Member saves " },
            { kind: "binding", path: "props.card.member_save_ex_label" },
            { kind: "static", value: " (" },
            { kind: "binding", path: "props.card.member_save_pct" },
            { kind: "static", value: "%)" },
          ],
        },
        // A SALE badge — not a member claim. Left exactly as authored.
        { id: "span-cseed-8", kind: "element", tag: "span", text: [{ kind: "static", value: "Save " }, { kind: "binding", path: "props.card.save_pct" }, { kind: "static", value: "%" }] },
      ],
    },
  } as unknown as NodeTree;
}

const find = (node: BuilderNode, id: string): BuilderNode | null => {
  if (node.id === id) return node;
  const kids = node.kind === "element" || node.kind === "repeat" ? (node.children ?? []) : [];
  for (const k of kids) {
    const hit = find(k, id);
    if (hit) return hit;
  }
  return null;
};
const textOf = (node: BuilderNode | null) =>
  node && node.kind === "element"
    ? (node.text ?? []).map((p) => (p.kind === "static" ? p.value : `{${p.kind === "binding" ? p.path : ""}}`)).join("")
    : "";

test("with the scale OFF nothing changes — the same map comes back, 'RRP' is still true", () => {
  const components = { "price-panel": pricePanel(), "price-block": priceBlock() };
  assert.equal(withMemberScaleLabels(components, false), components);
});

test("Chefs Depot, scale OFF: a member saving loses its percentage in this state too, and 'RRP' stays", () => {
  // The card's rule is "no saving percentage renders anywhere while the spread is
  // unmeasured" — no on/off carve-out. Only the RRP wording waits for the switch.
  const components = { "price-panel": pricePanel(), "price-block": priceBlock() };
  const out = withMemberScaleLabels(components, false, { hideMemberPct: true });
  assert.notEqual(out, components);
  assert.equal(textOf(find(out["price-panel"].root, "rrp-save-x17")), "You save ${purchase.saveAmount}");
  assert.equal(textOf(find(out["price-block"].root, "span-cseed-207")), "Member saves {props.card.member_save_ex_label}");
  assert.equal(textOf(find(out["price-panel"].root, "price-rrp-label-x24")), "RRP");
  assert.equal(textOf(find(out["price-panel"].root, "rrp-label-x14")), "RRP ");
  assert.equal(textOf(find(out["price-block"].root, "card-rrp-label-x42")), "RRP");
  assert.deepEqual(
    (find(out["price-panel"].root, "teaser-copy-b-x28") as { condition?: unknown }).condition,
    { kind: "expr", source: "false" }
  );
  // The SALE badge is not a member claim, in this state either.
  assert.equal(textOf(find(out["price-block"].root, "span-cseed-8")), "Save {props.card.save_pct}%");
});

test("a single tree with relabelRrp false cuts the percentage and keeps 'RRP'", () => {
  const out = withMemberScaleLabelsInTree(pricePanel(), { relabelRrp: false });
  assert.equal(textOf(find(out.root, "rrp-save-x17")), "You save ${purchase.saveAmount}");
  assert.equal(textOf(find(out.root, "price-rrp-label-x24")), "RRP");
});

test("with the scale ON the headline and the comparison are the standard price, not RRP", () => {
  const out = withMemberScaleLabelsInTree(pricePanel());
  assert.equal(textOf(find(out.root, "price-rrp-label-x24")), STANDARD_PRICE_LABEL);
  assert.equal(textOf(find(out.root, "rrp-label-x14")), `${STANDARD_PRICE_LABEL} `);
});

test("a member's saving keeps its dollars and loses its percentage", () => {
  const panel = withMemberScaleLabelsInTree(pricePanel());
  assert.equal(textOf(find(panel.root, "rrp-save-x17")), "You save ${purchase.saveAmount}");
  const tile = withMemberScaleLabelsInTree(priceBlock());
  assert.equal(textOf(find(tile.root, "span-cseed-207")), "Member saves {props.card.member_save_ex_label}");
  assert.equal(textOf(find(tile.root, "card-rrp-label-x42")), STANDARD_PRICE_LABEL);
});

test("a percentage that cannot be cut out cleanly hides its node instead of printing half a claim", () => {
  const out = withMemberScaleLabelsInTree(pricePanel());
  const teaser = find(out.root, "teaser-copy-b-x28");
  assert.deepEqual((teaser as { condition?: unknown }).condition, { kind: "expr", source: "false" });
});

test("the listing tile's SALE badge is not a member claim and is left alone", () => {
  const out = withMemberScaleLabelsInTree(priceBlock());
  assert.equal(textOf(find(out.root, "span-cseed-8")), "Save {props.card.save_pct}%");
  assert.equal((find(out.root, "span-cseed-8") as { condition?: unknown }).condition, undefined);
});

test("idempotent, and a tree with nothing to relabel is returned by identity", () => {
  const once = withMemberScaleLabelsInTree(pricePanel());
  const twice = withMemberScaleLabelsInTree(once);
  assert.deepEqual(twice, once);
  const plain = { v: 1, root: { id: "x", kind: "element", tag: "div", text: [{ kind: "static", value: "Hello" }] } } as unknown as NodeTree;
  assert.equal(withMemberScaleLabelsInTree(plain), plain);
});

test("nothing is written back: the input tree is untouched", () => {
  const input = pricePanel();
  const before = JSON.stringify(input);
  withMemberScaleLabelsInTree(input);
  assert.equal(JSON.stringify(input), before);
});
