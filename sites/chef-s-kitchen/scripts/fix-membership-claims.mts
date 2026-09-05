/**
 * Card gk23c1VK — correct the false member-pricing claims in the STORED Site
 * Builder trees.
 *
 * The homepage and the SEO FAQ still say member pricing is "cost-plus" and
 * "typically 10–25% below retail". Under the buying-group model neither is
 * true: there is no cost input, and the distance between the entry and floor
 * trade prices is set item by item, so the catalogue cannot produce a single
 * percentage. "Off retail" also misdescribes the reference price.
 *
 * The React source is fixed in the same change, but Chefs Depot's homepage was
 * AUTHORED in the Site Builder, so the stored tree is what customers actually
 * read — page 57, published version 144, node `p-fq4`. This rewrites the stored
 * copies. Every channel is walked, not just this site's: the claim is a
 * group-wide compliance problem.
 *
 * Idempotent and safe to re-run. Run from sites/chef-s-kitchen:
 *   # 1. see what would change, touching nothing
 *   node --env-file=.env scripts/fix-membership-claims.mts
 *   # 2. drafts only — live rendering unaffected
 *   node --env-file=.env scripts/fix-membership-claims.mts --apply --draft-only
 *   # 3. drafts + published — this is the one customers see. Run it in the same
 *   #    deploy wave as this card, then purge the storefront cache (published
 *   #    CMS reads are cached 300s).
 *   node --env-file=.env scripts/fix-membership-claims.mts --apply
 *
 * Published rows are edited in place rather than by publishing a new version, so
 * page history is preserved and reverting is restoring the row.
 */
import postgres from "postgres";
import type { NodeTree } from "@keenan/services/builder";
import {
  rewriteMembershipClaims,
  findMembershipClaims,
  rewriteMembershipStrings,
  MEMBERSHIP_CLAIM_MARKERS,
} from "../src/builder/membership-claims.ts";

const APPLY = process.argv.includes("--apply");
const DRAFT_ONLY = process.argv.includes("--draft-only");

let changes = 0;
/** Trees that still carry a claim after the pass. Reported at the end, loudly. */
const leftovers: string[] = [];

/** Post-condition on EVERY tree, not only the ones this pass rewrote. A claim an
 *  author split across sibling nodes used to be invisible to the exact-match
 *  rewrite AND to this check, so the run reported "already clean" while the
 *  words went on rendering — which is how "10–25%" survived the first pass. */
function audit(label: string, tree: NodeTree | null) {
  if (!tree) return;
  const found = findMembershipClaims(tree);
  if (found.length) leftovers.push(`${label}: ${found.join(" / ")}`);
}

/** Rewrite one stored tree, enforce the post-condition, and report. */
function plan(label: string, tree: NodeTree | null): { tree: NodeTree } | null {
  if (!tree) return null;
  const { tree: next, rewritten } = rewriteMembershipClaims(tree);
  if (rewritten.length === 0) return null;

  const leftovers = findMembershipClaims(next);
  if (leftovers.length) {
    throw new Error(
      `${label} still contains ${leftovers.join(" / ")} after the rewrite — the claim was retyped ` +
        `into another node; fix it in the Site Builder before re-running`
    );
  }
  changes++;
  console.log(`  ${label}: rewrites ${rewritten.length} claim(s)`);
  return { tree: next };
}

async function main() {
  const url = process.env.COMMERCE_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_DATABASE_URL not set");
  const sql = postgres(url, { max: 1 });

  console.log(APPLY ? (DRAFT_ONLY ? "MODE: apply (drafts only)" : "MODE: apply (drafts + published)") : "MODE: dry run");

  try {
    const pages = (await sql`
      SELECT id, channel_id, slug, status, published_version_id, node_tree
      FROM cms_pages ORDER BY channel_id, id`) as unknown as {
      id: number;
      channel_id: number;
      slug: string;
      status: string;
      published_version_id: number | null;
      node_tree: NodeTree | null;
    }[];

    for (const page of pages) {
      const draft = plan(`page ${page.id} "${page.slug}" draft`, page.node_tree);
      audit(`page ${page.id} "${page.slug}" draft`, draft?.tree ?? page.node_tree);
      if (draft && APPLY) {
        await sql`UPDATE cms_pages SET node_tree = ${sql.json(draft.tree as never)}, draft_updated_at = now() WHERE id = ${page.id}`;
        console.log("    draft: UPDATED");
      }

      if (page.published_version_id == null) continue;
      const [version] = (await sql`
        SELECT id, node_tree FROM cms_page_versions WHERE id = ${page.published_version_id}`) as unknown as {
        id: number;
        node_tree: NodeTree | null;
      }[];
      const published = plan(`page ${page.id} "${page.slug}" published (v${version?.id})`, version?.node_tree ?? null);
      audit(`page ${page.id} published v${version?.id}`, published?.tree ?? version?.node_tree ?? null);
      if (published && APPLY && !DRAFT_ONLY) {
        await sql`UPDATE cms_page_versions SET node_tree = ${sql.json(published.tree as never)} WHERE id = ${version.id}`;
        console.log("    published: UPDATED");
      } else if (published && DRAFT_ONLY) {
        console.log("    published: SKIPPED (--draft-only)");
      }
    }

    // Component masters: one edit reaches every page an instance sits on.
    const components = (await sql`
      SELECT id, channel_id, key, draft_tree, published_tree
      FROM cms_components ORDER BY channel_id, key`) as unknown as {
      id: number;
      channel_id: number;
      key: string;
      draft_tree: NodeTree | null;
      published_tree: NodeTree | null;
    }[];

    for (const c of components) {
      const draft = plan(`component "${c.key}" (${c.id}) draft`, c.draft_tree);
      audit(`component "${c.key}" (${c.id}) draft`, draft?.tree ?? c.draft_tree);
      if (draft && APPLY) {
        await sql`UPDATE cms_components SET draft_tree = ${sql.json(draft.tree as never)} WHERE id = ${c.id}`;
        console.log("    draft tree: UPDATED");
      }
      const pub = plan(`component "${c.key}" (${c.id}) published`, c.published_tree);
      audit(`component "${c.key}" (${c.id}) published`, pub?.tree ?? c.published_tree);
      if (pub && APPLY && !DRAFT_ONLY) {
        await sql`UPDATE cms_components SET published_tree = ${sql.json(pub.tree as never)} WHERE id = ${c.id}`;
        console.log("    published tree: UPDATED");
      } else if (pub && DRAFT_ONLY) {
        console.log("    published tree: SKIPPED (--draft-only)");
      }
    }

    // The membership PLAN's benefit list. Not a tree, but rendered on the home
    // value strip and on both fee cards, so a false claim there is as live as one
    // in a page — and it is the one the first pass missed entirely.
    const plans = (await sql`
      SELECT id, channel_id, name, benefits FROM subscription_plans ORDER BY id`) as unknown as {
      id: number;
      channel_id: number;
      name: string;
      benefits: string[] | null;
    }[];

    for (const row of plans) {
      const before = Array.isArray(row.benefits) ? row.benefits : [];
      if (before.length === 0) continue;
      const { values, rewritten } = rewriteMembershipStrings(before);
      const stillClaiming = values.filter((v) =>
        MEMBERSHIP_CLAIM_MARKERS.some((m) => v.toLowerCase().includes(m.toLowerCase()))
      );
      if (stillClaiming.length) {
        leftovers.push(`subscription_plan ${row.id} benefits: ${stillClaiming.join(" / ")}`);
      }
      if (rewritten.length === 0) continue;
      changes++;
      console.log(`  plan ${row.id} "${row.name}" benefits: rewrites ${rewritten.length} claim(s)`);
      if (APPLY) {
        await sql`UPDATE subscription_plans SET benefits = ${sql.json(values as never)} WHERE id = ${row.id}`;
        console.log("    benefits: UPDATED");
      }
    }

    if (leftovers.length) {
      console.error("\nCLAIMS STILL PRESENT after the pass:");
      for (const l of leftovers) console.error("  " + l);
      console.error(
        "\nEach of these renders to a customer. Fix it in the Site Builder (or add the " +
          "exact wording to MEMBERSHIP_CLAIM_REWRITES) and re-run."
      );
    }

    console.log(
      changes === 0
        ? "\nnothing to do — every stored tree is already clean"
        : APPLY
          ? `\ndone — ${changes} tree(s) planned; see UPDATED lines for what was written`
          : `\ndry run — ${changes} tree(s) would change. Re-run with --apply to write.`
    );
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
