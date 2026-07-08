/**
 * Seed the CD product-page template (cms_pages doc 71, channel 2) DRAFT from
 * SEED_PRODUCT_TREE so it can be edited in the portal node designer.
 *
 * SAFE: writes only the DRAFT (node_tree column + builder_kind + draft_updated_at).
 * The published version (v2 blocks) is untouched, and the live route is gated by
 * the node_product_template_enabled flag (OFF) — so live rendering is unaffected
 * until we flip that flag. DOES NOT publish.
 *
 * Run: (from sites/chef-s-kitchen)
 *   node --env-file=.env --import tsx scripts/seed-product-template.mts
 */
import postgres from "postgres";
import { sanitizeTree, validateTree } from "@keenan/services/builder";
import { SEED_PRODUCT_TREE } from "../src/builder/seeds/product";

const CHANNEL_ID = 2;
const PAGE_ID = 71;

function countNodes(node: any): number {
  let n = 1;
  for (const c of node.children ?? []) n += countNodes(c);
  for (const c of node.emptyChildren ?? []) n += countNodes(c);
  return n;
}

async function main() {
  const url = process.env.COMMERCE_DATABASE_URL;
  if (!url) throw new Error("COMMERCE_DATABASE_URL not set");

  // 1. Validate + sanitize — confirm the tree round-trips with ZERO node loss,
  //    i.e. nothing the designer would strip on save.
  const diagnostics = validateTree(SEED_PRODUCT_TREE);
  if (diagnostics.length) {
    console.error("validateTree diagnostics:", JSON.stringify(diagnostics, null, 2));
    throw new Error(`${diagnostics.length} validation diagnostics — aborting`);
  }
  const clean = sanitizeTree(SEED_PRODUCT_TREE);
  if (!clean) throw new Error("sanitizeTree returned null");
  const before = countNodes(SEED_PRODUCT_TREE.root);
  const after = countNodes(clean.root);
  console.log(`nodes: seed=${before}  sanitized=${after}  ${before === after ? "OK (lossless)" : "⚠️ NODE LOSS"}`);
  if (before !== after) throw new Error("sanitize dropped nodes — a tag/attr is disallowed; aborting");

  // 2. Write the DRAFT only.
  const sql = postgres(url, { max: 1 });
  try {
    const [row] = await sql`
      SELECT id, channel_id, page_kind, builder_kind, status, published_version_id
      FROM cms_pages WHERE id = ${PAGE_ID} AND channel_id = ${CHANNEL_ID}`;
    if (!row) throw new Error(`doc ${PAGE_ID} (channel ${CHANNEL_ID}) not found`);
    console.log("before:", row);

    await sql`
      UPDATE cms_pages
      SET node_tree = ${sql.json(clean as any)},
          builder_kind = 'nodes',
          draft_updated_at = now()
      WHERE id = ${PAGE_ID} AND channel_id = ${CHANNEL_ID}`;

    const [after2] = await sql`
      SELECT builder_kind, (node_tree IS NOT NULL) AS has_tree,
             jsonb_array_length(node_tree->'root'->'children') AS root_children,
             published_version_id
      FROM cms_pages WHERE id = ${PAGE_ID} AND channel_id = ${CHANNEL_ID}`;
    console.log("after:", after2);
    console.log("✅ seeded draft (published version untouched)");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
