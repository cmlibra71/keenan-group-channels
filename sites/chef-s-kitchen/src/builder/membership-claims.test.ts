import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  rewriteMembershipClaims,
  findMembershipClaims,
  MEMBERSHIP_CLAIM_REWRITES,
} from "./membership-claims";

const LIVE_FAQ_ANSWER = MEMBERSHIP_CLAIM_REWRITES[0].from;

/** The shape the live homepage carries — page 57, published version 144, node p-fq4. */
const liveTree = (): NodeTree =>
  ({
    id: "root",
    tag: "div",
    kind: "element",
    children: [
      {
        id: "details-fq4",
        tag: "details",
        kind: "element",
        classes: ["group", "py-4"],
        children: [
          {
            id: "su-fq4",
            tag: "summary",
            kind: "element",
            text: [{ kind: "static", value: "How does Chefs Depot membership pricing work?" }],
          },
          {
            id: "p-fq4",
            tag: "p",
            kind: "element",
            text: [{ kind: "static", value: LIVE_FAQ_ANSWER }],
            classes: ["mt-2.5", "text-sm", "leading-relaxed", "text-text-secondary"],
          },
        ],
      },
    ],
  }) as unknown as NodeTree;

test("the live homepage FAQ answer is rewritten, and the question is left standing", () => {
  const { tree, rewritten } = rewriteMembershipClaims(liveTree());
  assert.equal(rewritten.length, 1);

  const json = JSON.stringify(tree);
  assert.ok(!json.includes("cost-plus"), "cost-plus must not survive");
  assert.ok(!json.includes("10–25%"), "the percentage claim must not survive");
  assert.ok(
    json.includes("How does Chefs Depot membership pricing work?"),
    "removing the answer instead of rewriting it would leave a question with none"
  );
  assert.ok(json.includes("calculated from our current trade price list"));
});

test("the post-condition catches a claim retyped into another node", () => {
  const { tree } = rewriteMembershipClaims(liveTree());
  assert.deepEqual(findMembershipClaims(tree), []);

  const retyped = {
    id: "root",
    tag: "div",
    kind: "element",
    children: [
      { id: "x", tag: "p", kind: "element", text: [{ kind: "static", value: "Save 10-25% off retail!" }] },
    ],
  } as unknown as NodeTree;
  const after = rewriteMembershipClaims(retyped);
  assert.deepEqual(after.rewritten, [], "not an exact known string, so nothing is rewritten");
  assert.ok(findMembershipClaims(after.tree).length > 0, "…and the run must fail loudly instead");
});

test("a clean tree is left alone and the pass is idempotent", () => {
  const clean = {
    id: "root",
    tag: "div",
    kind: "element",
    children: [{ id: "p", tag: "p", kind: "element", text: [{ kind: "static", value: "Free delivery over $500" }] }],
  } as unknown as NodeTree;
  assert.deepEqual(rewriteMembershipClaims(clean).rewritten, []);

  const once = rewriteMembershipClaims(liveTree());
  const twice = rewriteMembershipClaims(once.tree);
  assert.deepEqual(twice.rewritten, []);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.tree)), JSON.parse(JSON.stringify(once.tree)));
});

test("component instances, styles and bindings are copied through untouched", () => {
  const authored = {
    id: "root",
    tag: "div",
    kind: "element",
    children: [
      {
        id: "inst-1",
        kind: "component",
        componentKey: "product-card",
        props: { heading: "Members save 10–25% on every order." },
        classes: ["grid"],
        styleRef: "card-shadow",
      },
      {
        id: "bound",
        tag: "p",
        kind: "element",
        text: [{ kind: "binding", path: "product.name" }],
      },
    ],
  } as unknown as NodeTree;

  const { tree } = rewriteMembershipClaims(authored);
  const out = JSON.parse(JSON.stringify(tree));
  assert.equal(out.children[0].componentKey, "product-card");
  assert.equal(out.children[0].styleRef, "card-shadow");
  // A claim inside a component PROP is not static node text; the pass leaves it
  // alone rather than guessing at a prop's meaning, and the post-condition does
  // not read props either. Recorded so nobody assumes it was covered.
  assert.equal(out.children[0].props.heading, "Members save 10–25% on every order.");
  assert.deepEqual(out.children[1].text[0], { kind: "binding", path: "product.name" });
});
