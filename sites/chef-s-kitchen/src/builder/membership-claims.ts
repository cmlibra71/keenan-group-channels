import type { NodeTree } from "@keenan/services/builder";

// ============================================================================
// Card gk23c1VK — the homepage and FAQ still describe member pricing as
// "cost-plus" and claim "10–25% below retail". Under the buying-group model
// both are false: pricing is interpolated between two trade prices whose
// distance is set item by item, so there is no cost input and no single
// percentage. The old claim also misdescribed the reference price, which is our
// standard trade price rather than "retail".
//
// Taking the copy out of the React source is only half the job. The storefront
// renders the AUTHORED tree from the database — `cms_page_versions.node_tree` of
// the published version for a live read, `cms_pages.node_tree` for a draft, and
// `cms_components.published_tree` for every component inside it — and Chefs
// Depot's homepage WAS authored (page 57, published version 144 carries the FAQ
// answer verbatim). This is the pure half of the database cleanup;
// `scripts/fix-membership-claims.mts` is the runner.
//
// It REWRITES rather than removes: the FAQ question stays, the answer is
// replaced. A removal would leave a question with no answer.
// ============================================================================

/**
 * Exact copy replacements, longest-first so a rewrite cannot half-match another.
 * These are literal strings from the live trees and the React source, kept in
 * one place so the two can never drift.
 */
export const MEMBERSHIP_CLAIM_REWRITES: Array<{ from: string; to: string }> = [
  {
    from:
      "Members pay wholesale, cost-plus pricing across the catalogue — typically 10–25% below retail. " +
      "Join from $14.95/month and your member price is applied automatically at cart and checkout.",
    to:
      "Member pricing is calculated from our current trade price list at the moment you see it — the same " +
      "list our own team quotes from. Membership starts from $14.95/month, your member price applies from " +
      "your first order, and it steps down further as your rolling twelve-month spend grows. The distance " +
      "is set item by item, so there is no single percentage: your price is shown on every product page " +
      "once you are signed in.",
  },
  {
    from: "Members save 10–25% on every order.",
    to: "Members buy at a different price tier, from their first order.",
  },
  {
    from: "Members save 10–25% off retail",
    to: "Members buy at a different price tier",
  },
  {
    from: "Save 10-25% off retail on all kitchen equipment. The more you buy, the more you save.",
    to:
      "Members buy at a different price tier, from their first order — and it steps down further as your " +
      "spend builds.",
  },
];

/**
 * What must NOT survive the pass. Checked as a post-condition, so a claim
 * retyped into another node fails the run loudly instead of shipping.
 */
export const MEMBERSHIP_CLAIM_MARKERS = [
  "10–25%",
  "10-25%",
  "cost-plus",
  "cost plus",
  "off retail",
] as const;

export interface ClaimRewriteResult {
  tree: NodeTree;
  /** The `from` strings actually found and replaced, in tree order. Empty = clean. */
  rewritten: string[];
}

// The walk is deliberately GENERIC — every object and array value, not just the
// two child keys. A stored tree is `{ v, root: { … } }` with component
// instances, slots and prop bags in between, and a walker that only followed
// `children` silently reported "already clean" on the very page this exists to
// fix. Only `text[].value` strings are ever rewritten, and only when they match
// a known claim exactly; everything else is copied through byte for byte, which
// is what keeps component instances, styles and bindings intact.
type NodeRecord = Record<string, unknown>;

function rewriteText(value: string, rewritten: string[]): string {
  let out = value;
  for (const rule of MEMBERSHIP_CLAIM_REWRITES) {
    if (out.includes(rule.from)) {
      out = out.split(rule.from).join(rule.to);
      rewritten.push(rule.from);
    }
  }
  return out;
}

function rewriteNode(node: unknown, rewritten: string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => rewriteNode(n, rewritten));
  if (!node || typeof node !== "object") return node;

  const rec = node as NodeRecord;
  const next: NodeRecord = {};

  for (const [key, value] of Object.entries(rec)) {
    if (key === "text" && Array.isArray(value)) {
      next.text = (value as unknown[]).map((part) => {
        if (part && typeof part === "object" && "value" in part) {
          const raw = (part as { value: unknown }).value;
          if (typeof raw === "string") {
            return { ...(part as Record<string, unknown>), value: rewriteText(raw, rewritten) };
          }
        }
        return part;
      });
      continue;
    }
    next[key] = rewriteNode(value, rewritten);
  }

  return next;
}

/** A copy of the tree with every known false claim rewritten. */
export function rewriteMembershipClaims(tree: NodeTree): ClaimRewriteResult {
  const rewritten: string[] = [];
  const next = rewriteNode(tree, rewritten) as NodeTree;
  return { tree: next, rewritten };
}

/** Any surviving claim marker ANYWHERE in the tree, for the post-condition. */
export function findMembershipClaims(tree: NodeTree): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      for (const marker of MEMBERSHIP_CLAIM_MARKERS) {
        if (node.toLowerCase().includes(marker.toLowerCase())) found.add(marker);
      }
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(tree);
  return [...found];
}
