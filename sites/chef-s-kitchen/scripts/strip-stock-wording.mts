/**
 * Card CXnP1lrL — strip the stock-status wording from the STORED Site Builder
 * trees (product templates + component masters).
 *
 * Why this exists: the storefront renders the AUTHORED tree from the database —
 * `cms_page_versions.node_tree` of the published version for a live read,
 * `cms_pages.node_tree` for a draft read, and `cms_components.published_tree`
 * for every component instance inside it. `SEED_PRODUCT_TREE` is only the
 * fallback for a site whose template was never authored. Chefs Depot's WAS
 * authored (its buy panel, actions row, tabs and product card were extracted
 * into components), so removing the wording from the seed and the React
 * components alone changes nothing a customer can see. This removes it from the
 * stored copies:
 *
 *   • product template  → "Ships to order …", "In stock", "Check availability"
 *   • product-card master → the "Low Stock" tile badge
 *
 * Every channel is processed, not just this site's: the wording is a group-wide
 * rule. Industry Kitchens' trees were authored clean, so it reports and skips.
 *
 * Idempotent and safe to re-run. Run from sites/chef-s-kitchen:
 *   # 1. see what would change, touching nothing
 *   node --env-file=.env --import tsx scripts/strip-stock-wording.mts
 *   # 2. drafts only — live rendering unaffected; the Site Builder and /json
 *   #    previews show the cleaned trees
 *   node --env-file=.env --import tsx scripts/strip-stock-wording.mts --apply --draft-only
 *   # 3. drafts + published — this is the one customers see. Run it in the same
 *   #    deploy wave as the back-orders card (7vu2iEEZ), never before it, then
 *   #    purge the storefront cache (published CMS reads are cached 300s).
 *   node --env-file=.env --import tsx scripts/strip-stock-wording.mts --apply
 *
 * Published rows are edited in place rather than by publishing a new version, so
 * page history is preserved and reverting is restoring the row.
 */
import postgres from "postgres";
import type { NodeTree } from "@keenan/services/builder";
import { stripStockNodes, findStockWording } from "../src/builder/strip-stock-nodes";

const APPLY = process.argv.includes("--apply");
const DRAFT_ONLY = process.argv.includes("--draft-only");

let changes = 0;

/** Strip one stored tree, enforce the post-condition, and report. */
function plan(label: string, tree: NodeTree | null): { tree: NodeTree; removed: string[] } | null {
  if (!tree) {
    console.log(`  ${label}: no tree`);
    return null;
  }
  const { tree: next, removed } = stripStockNodes(tree);
  if (removed.length === 0) {
    console.log(`  ${label}: already clean`);
    return null;
  }
  const leftovers = findStockWording(next);
  if (leftovers.length) {
    throw new Error(
      `${label} still contains ${leftovers.join(" / ")} after stripping — the copy was retyped into another node; fix it in the Site Builder before re-running`
    );
  }
  changes++;
  console.log(`  ${label}: removes ${removed.join(", ")}`);
  return { tree: next, removed };
}

async function main() {
  const url = process.env.COMMERCE_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_DATABASE_URL not set");
  const sql = postgres(url, { max: 1 });

  console.log(APPLY ? (DRAFT_ONLY ? "MODE: apply (drafts only)" : "MODE: apply (drafts + published)") : "MODE: dry run");

  try {
    // ── Product templates ────────────────────────────────────────────────────
    const pages = (await sql`
      SELECT id, channel_id, status, builder_kind, published_version_id, node_tree
      FROM cms_pages WHERE page_kind = 'product' ORDER BY channel_id`) as unknown as {
      id: number;
      channel_id: number;
      status: string;
      builder_kind: string | null;
      published_version_id: number | null;
      node_tree: NodeTree | null;
    }[];

    for (const page of pages) {
      console.log(`\n— product template page ${page.id} (channel ${page.channel_id}, ${page.status}, ${page.builder_kind})`);

      const draft = plan("draft", page.node_tree);
      if (draft && APPLY) {
        await sql`UPDATE cms_pages SET node_tree = ${sql.json(draft.tree as never)}, draft_updated_at = now() WHERE id = ${page.id}`;
        console.log("  draft: UPDATED");
      }

      if (page.published_version_id == null) {
        console.log("  published: none");
        continue;
      }
      const [version] = (await sql`
        SELECT id, node_tree FROM cms_page_versions WHERE id = ${page.published_version_id}`) as unknown as {
        id: number;
        node_tree: NodeTree | null;
      }[];
      const published = plan(`published (v${version?.id})`, version?.node_tree ?? null);
      if (published && APPLY && !DRAFT_ONLY) {
        await sql`UPDATE cms_page_versions SET node_tree = ${sql.json(published.tree as never)} WHERE id = ${version.id}`;
        console.log("  published: UPDATED");
      } else if (published && DRAFT_ONLY) {
        console.log("  published: SKIPPED (--draft-only)");
      }
    }

    // ── Component masters ────────────────────────────────────────────────────
    // The tile badge lives here, not on any page: every listing grid renders the
    // `product-card` master, so one edit covers category, brand, search and home.
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
      const draft = c.draft_tree ? stripStockNodes(c.draft_tree) : null;
      const pub = c.published_tree ? stripStockNodes(c.published_tree) : null;
      // Quiet by default: dozens of components are untouched and listing them
      // all would bury the two lines that matter.
      if (!draft?.removed.length && !pub?.removed.length) continue;

      console.log(`\n— component "${c.key}" (id ${c.id}, channel ${c.channel_id})`);
      if (draft?.removed.length) {
        const planned = plan("draft tree", c.draft_tree);
        if (planned && APPLY) {
          await sql`UPDATE cms_components SET draft_tree = ${sql.json(planned.tree as never)} WHERE id = ${c.id}`;
          console.log("  draft tree: UPDATED");
        }
      }
      if (pub?.removed.length) {
        const planned = plan("published tree", c.published_tree);
        if (planned && APPLY && !DRAFT_ONLY) {
          await sql`UPDATE cms_components SET published_tree = ${sql.json(planned.tree as never)} WHERE id = ${c.id}`;
          console.log("  published tree: UPDATED");
        } else if (planned && DRAFT_ONLY) {
          console.log("  published tree: SKIPPED (--draft-only)");
        }
      }
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
