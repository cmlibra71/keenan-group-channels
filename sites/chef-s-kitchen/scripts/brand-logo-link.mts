/**
 * Card uzeXShZu — put the brand-logo link into the STORED Site Builder product
 * templates.
 *
 * Why this exists (same reason as `strip-stock-wording.mts`): the storefront
 * renders the AUTHORED tree from the database — `cms_pages.node_tree` for a
 * draft read, `cms_page_versions.node_tree` of the published version for a live
 * one — and `SEED_PRODUCT_TREE` is only the fallback for a site whose template
 * was never authored. Both channels HAVE authored theirs, so adding the node to
 * the seed alone changes nothing a customer can see.
 *
 * What it inserts: an `<a rel="nofollow" href="/brands/…">` whose only content
 * is the brand's logo `<img>` with the brand name as its ALT tag, immediately
 * above the product title. Chefs Depot's plain-text brand line becomes the
 * no-logo fallback; Industry Kitchens has no brand line at all, so the link
 * anchors on the `<h1>`. The rule itself lives in
 * `src/builder/brand-logo-link.ts` and is unit-tested.
 *
 * Every channel is processed, not just this site's: the brand link is a
 * group-wide rule (Tim, 2026-08-11).
 *
 * Idempotent and safe to re-run — a tree that already carries the link is left
 * byte-identical. Run from sites/chef-s-kitchen:
 *   # 1. see what would change, touching nothing
 *   node --env-file=.env --import tsx scripts/brand-logo-link.mts
 *   # 2. drafts only — live rendering unaffected; the Site Builder and the
 *   #    /node-preview + preview-cookie surfaces show the new tree
 *   node --env-file=.env --import tsx scripts/brand-logo-link.mts --apply --draft-only
 *   # 3. drafts + published — this is the one customers see. Published CMS
 *   #    reads are cached 300s, so allow up to five minutes.
 *   node --env-file=.env --import tsx scripts/brand-logo-link.mts --apply
 *
 * `--backup <dir>` writes every tree it is about to change to a JSON file first;
 * restoring one is a single UPDATE with that file's contents. Published rows are
 * edited in place rather than by publishing a new version, so page history is
 * preserved and reverting is restoring the row.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import postgres from "postgres";
import type { NodeTree } from "@keenan/services/builder";
import { applyBrandLogoLink, checkBrandLogoLink } from "../src/builder/brand-logo-link";

const APPLY = process.argv.includes("--apply");
const DRAFT_ONLY = process.argv.includes("--draft-only");
const BACKUP_DIR = (() => {
  const i = process.argv.indexOf("--backup");
  return i >= 0 ? process.argv[i + 1] : null;
})();

let changes = 0;

/** Insert into one stored tree, enforce the post-condition, and report. */
function plan(label: string, tree: NodeTree | null): NodeTree | null {
  if (!tree) {
    console.log(`  ${label}: no tree`);
    return null;
  }
  const { tree: next, inserted, anchorId, eyebrowGuarded } = applyBrandLogoLink(tree);
  if (!inserted) {
    // Two very different non-events, and confusing them would hide a broken run.
    const already = checkBrandLogoLink(tree).length === 0;
    console.log(`  ${label}: ${already ? "already has the brand logo link" : "NO ANCHOR — no brand line and no bound <h1>; skipped"}`);
    return null;
  }
  const problems = checkBrandLogoLink(next);
  if (problems.length) {
    throw new Error(`${label} is wrong after insertion: ${problems.join(" / ")}`);
  }
  changes++;
  console.log(
    `  ${label}: inserts the brand logo link above "${anchorId}"` +
      (eyebrowGuarded ? " (the text brand line becomes the no-logo fallback)" : "")
  );
  return next;
}

function backup(name: string, tree: NodeTree) {
  if (!BACKUP_DIR) return;
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(`${BACKUP_DIR}/${name}.json`, JSON.stringify(tree, null, 2));
  console.log(`  backed up → ${BACKUP_DIR}/${name}.json`);
}

async function main() {
  const url = process.env.COMMERCE_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_DATABASE_URL not set");
  const sql = postgres(url, { max: 1 });

  console.log(APPLY ? (DRAFT_ONLY ? "MODE: apply (drafts only)" : "MODE: apply (drafts + published)") : "MODE: dry run");

  try {
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
        backup(`page-${page.id}-draft`, page.node_tree as NodeTree);
        await sql`UPDATE cms_pages SET node_tree = ${sql.json(draft as never)}, draft_updated_at = now() WHERE id = ${page.id}`;
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
        backup(`version-${version.id}`, version.node_tree as NodeTree);
        await sql`UPDATE cms_page_versions SET node_tree = ${sql.json(published as never)} WHERE id = ${version.id}`;
        console.log("  published: UPDATED");
      } else if (published && DRAFT_ONLY) {
        console.log("  published: SKIPPED (--draft-only)");
      }
    }

    console.log(
      changes === 0
        ? "\nnothing to do — every stored product template already links the brand logo"
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
