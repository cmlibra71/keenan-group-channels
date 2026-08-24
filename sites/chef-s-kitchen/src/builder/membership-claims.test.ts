import { test } from "node:test";
import assert from "node:assert/strict";
import type { NodeTree } from "@keenan/services/builder";
import {
  rewriteMembershipClaims,
  rewriteMembershipStrings,
  findMembershipClaims,
  MEMBERSHIP_CLAIM_REWRITES,
} from "./membership-claims";

const LIVE_FAQ_ANSWER = MEMBERSHIP_CLAIM_REWRITES[0].from;

/**
 * The shape the live homepage really carries — page 57, published version 144.
 * The `{ v, root }` wrapper is the point: a walker that started at the top and
 * only followed `children` reported "already clean" on this exact tree.
 */
const liveTree = (): NodeTree =>
  ({
    v: 1,
    root: {
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
    },
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
    v: 1,
    root: {
      id: "root",
      tag: "div",
      kind: "element",
      children: [
        { id: "x", tag: "p", kind: "element", text: [{ kind: "static", value: "Save 10-25% off retail!" }] },
      ],
    },
  } as unknown as NodeTree;
  const after = rewriteMembershipClaims(retyped);
  assert.deepEqual(after.rewritten, [], "not an exact known string, so nothing is rewritten");
  assert.ok(findMembershipClaims(after.tree).length > 0, "…and the run must fail loudly instead");
});

test("a clean tree is left alone and the pass is idempotent", () => {
  const clean = {
    v: 1,
    root: {
      id: "root",
      tag: "div",
      kind: "element",
      children: [
        { id: "p", tag: "p", kind: "element", text: [{ kind: "static", value: "Free delivery over $500" }] },
      ],
    },
  } as unknown as NodeTree;
  assert.deepEqual(rewriteMembershipClaims(clean).rewritten, []);

  const once = rewriteMembershipClaims(liveTree());
  const twice = rewriteMembershipClaims(once.tree);
  assert.deepEqual(twice.rewritten, []);
  assert.deepEqual(JSON.parse(JSON.stringify(twice.tree)), JSON.parse(JSON.stringify(once.tree)));
});

test("component instances, styles and bindings are copied through untouched", () => {
  const authored = {
    v: 1,
    root: {
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
    },
  } as unknown as NodeTree;

  const { tree } = rewriteMembershipClaims(authored);
  const out = JSON.parse(JSON.stringify(tree));
  assert.equal(out.root.children[0].componentKey, "product-card");
  assert.equal(out.root.children[0].styleRef, "card-shadow");
  // A claim inside a component PROP is not static node text, so the pass does
  // not rewrite it — it would be guessing at a prop's meaning. The
  // POST-CONDITION does read it, though, so a run that met one fails loudly
  // instead of shipping the claim. That is the trade: never guess, never ship.
  assert.equal(out.root.children[0].props.heading, "Members save 10–25% on every order.");
  assert.ok(findMembershipClaims(tree).length > 0, "the post-condition must still catch it");
  assert.deepEqual(out.root.children[1].text[0], { kind: "binding", path: "product.name" });
});


// ============================================================================
// The three ways the FIRST pass missed a live claim, each one now a test.
// ============================================================================

test("a claim SPLIT ACROSS SIBLING NODES is collapsed onto the first of them", () => {
  // The real home value strip, verbatim from the `membership-value-strip`
  // component master: the sentence "Members save 10–25% on every order." exists
  // in no single string, so an exact-match rewrite over one text run reported
  // the tree clean while the claim went on rendering to every visitor.
  const strip = {
    v: 1,
    root: {
      id: "root",
      tag: "div",
      kind: "element",
      children: [
        {
          id: "h3-cseed-149",
          tag: "h3",
          kind: "element",
          label: "strip-headline",
          classes: ["heading-serif"],
          children: [
            { id: "span-cseed-146", tag: "span", kind: "element", text: [{ kind: "static", value: "Members save " }], classes: [] },
            { id: "em-cseed-147", tag: "em", kind: "element", text: [{ kind: "static", value: "10–25%" }], classes: ["not-italic"] },
            { id: "span-cseed-148", tag: "span", kind: "element", text: [{ kind: "static", value: " on every order." }], classes: [] },
          ],
        },
      ],
    },
  } as unknown as NodeTree;

  const { tree, rewritten } = rewriteMembershipClaims(strip);
  assert.equal(rewritten.length, 1);
  assert.deepEqual(findMembershipClaims(tree), [], "no marker survives");

  const json = JSON.stringify(tree);
  assert.ok(json.includes("Members buy at a different price tier, from their first order."));
  // The styled fragment is REMOVED rather than left empty — an empty <em> with
  // classes is a fragment of a claim waiting to be refilled.
  assert.ok(!json.includes("em-cseed-147"));
  assert.ok(!json.includes("span-cseed-148"));
  // The first node keeps its id, so an author's selection and any style bound to
  // it survive the edit.
  assert.ok(json.includes("span-cseed-146"));

  assert.deepEqual(rewriteMembershipClaims(tree).rewritten, [], "idempotent");
});

test("a claim stored OUTSIDE a tree is rewritten too", () => {
  // `subscription_plans.benefits` — rendered on the home value strip and on both
  // membership fee cards, and live on chefsdepot.com.au until 2026-08-24.
  const { values, rewritten } = rewriteMembershipStrings([
    "Members-only pricing (10-25% off retail)",
    "Australia-wide delivery on all orders",
  ]);
  assert.equal(rewritten.length, 1);
  assert.deepEqual(values, [
    "Members-only pricing",
    "Australia-wide delivery on all orders",
  ]);
  assert.deepEqual(rewriteMembershipStrings(values).rewritten, [], "idempotent");
});

test("the replacement copy claims no percentage and no ladder the engine may not be running", () => {
  // Two separate rules: no product-saving percentage may be published at all
  // (blueprint §10/§13), and the always-on copy may not describe the buying-group
  // ladder, which ships switched off.
  for (const rule of MEMBERSHIP_CLAIM_REWRITES) {
    assert.ok(!/\d+\s*[–-]\s*\d+\s*%/.test(rule.to), `percentage range in: ${rule.to}`);
    assert.ok(!/rolling twelve-month|steps down|spend builds/i.test(rule.to), `ladder claim in: ${rule.to}`);
  }
});
