#!/usr/bin/env node

/**
 * Warmup script: pre-generate all optimized image sizes for existing products and categories.
 *
 * Usage:
 *   COMMERCE_DATABASE_URL=postgres://... node orchestrator/warmup-images.mjs
 *
 * Or set COMMERCE_DATABASE_URL in your environment / .env file.
 */

import postgres from "postgres";
import {
  generateOptimizedSizes,
  IMAGE_SIZES,
} from "@keenan/services/utils";

const BATCH_CONCURRENCY = 5;

async function main() {
  const dbUrl = process.env.COMMERCE_DATABASE_URL;
  if (!dbUrl) {
    console.error(
      "Error: COMMERCE_DATABASE_URL is required. Set it in your environment."
    );
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 3 });

  // Gather all image URLs
  console.log("Querying product images...");
  const productImages = await sql`
    SELECT DISTINCT url_standard FROM product_images WHERE url_standard IS NOT NULL
  `;

  console.log("Querying category images...");
  const categoryImages = await sql`
    SELECT DISTINCT image_url FROM categories WHERE image_url IS NOT NULL
  `;

  const allUrls = [
    ...productImages.map((r) => r.url_standard),
    ...categoryImages.map((r) => r.image_url),
  ].filter(Boolean);

  const uniqueUrls = [...new Set(allUrls)];
  console.log(
    `Found ${uniqueUrls.length} unique image URLs (${productImages.length} product, ${categoryImages.length} category)`
  );

  if (uniqueUrls.length === 0) {
    console.log("No images to process.");
    await sql.end();
    return;
  }

  let processed = 0;
  let totalBytes = 0;
  let totalSkipped = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < uniqueUrls.length; i += BATCH_CONCURRENCY) {
    const batch = uniqueUrls.slice(i, i + BATCH_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const result = await generateOptimizedSizes(url, {
          skipExisting: true,
        });
        return result;
      })
    );

    for (const result of results) {
      processed++;
      if (result.status === "fulfilled") {
        const r = result.value;
        totalBytes += r.totalBytes;
        totalSkipped += r.skipped;
        const sizesStr =
          r.sizes.length > 0
            ? `${r.sizes.length} sizes (${formatBytes(r.totalBytes)})`
            : `skipped (${r.skipped} cached)`;
        // Extract short filename from URL
        const shortName = r.url.split("/").slice(-2).join("/");
        console.log(`[${processed}/${uniqueUrls.length}] ${shortName} → ${sizesStr}`);
      } else {
        errors++;
        const shortName = batch[results.indexOf(result)]?.split("/").slice(-2).join("/") ?? "unknown";
        console.error(
          `[${processed}/${uniqueUrls.length}] ${shortName} → ERROR: ${result.reason?.message}`
        );
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Processed: ${processed}`);
  console.log(`Total uploaded: ${formatBytes(totalBytes)}`);
  console.log(`Skipped (cached): ${totalSkipped}`);
  console.log(`Errors: ${errors}`);

  await sql.end();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
