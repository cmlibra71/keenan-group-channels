import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The promotional tile tag (card FNYihLHk) must reach EVERY tile this site draws, not the tile on
 * whichever screen someone remembered to wire.
 *
 * The first cut of this card wired the transform into `builder/category-node-branch.tsx` alone.
 * That covered the category page and missed the product page's "You may also like" rail, which
 * repeats the very same `product-card` master — the same product, two of our own live screens,
 * one carrying the tag and one not. The brand branch, the home branch and `/pages/[slug]` were
 * the same latent gap.
 *
 * So the transform is applied ONCE, at the single read every authored surface goes through
 * (`@/lib/store` wrapping `getComponents` / `getDraftComponents`) — the seam card tSrCcnvx used
 * for the Industry Kitchens brand-logo fallback. These tests hold that seam shut: they are
 * source-level on purpose, because importing the store would open database connections.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const STORE = path.join(SRC, "lib", "store.ts");

/** Source with block and line comments removed, so prose cannot satisfy an assertion. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("the store, not a branch, is where the tile master gets the tag", () => {
  const store = code(STORE);
  assert.match(
    store,
    /withPromoTagInComponents/,
    "src/lib/store.ts must apply withPromoTagInComponents to the component masters"
  );
  assert.match(store, /export const getComponents\b/);
  assert.match(store, /export const getDraftComponents\b/);
});

test("the raw, untransformed component reads are not re-exported", () => {
  // `export const { ... getComponents ... } = _store;` would hand every branch the unwrapped map
  // again and silently undo the seam.
  const destructure = code(STORE).match(/export const \{[\s\S]*?\} = _store;/);
  assert.ok(destructure, "expected the channel-store destructure block in src/lib/store.ts");
  assert.doesNotMatch(destructure[0], /\bgetComponents\b/);
  assert.doesNotMatch(destructure[0], /\bgetDraftComponents\b/);
});

test("every reader of the component masters goes through @/lib/store", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    if (file === STORE) continue;
    const src = code(file);
    if (!/\bgetComponents\b|\bgetDraftComponents\b/.test(src)) continue;
    // The import that brought the name in must be the site store.
    const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)];
    const from = imports.find(
      (m) => /\bgetComponents\b|\bgetDraftComponents\b/.test(m[1])
    );
    if (!from || from[2] !== "@/lib/store") offenders.push(path.relative(SRC, file));
  }
  assert.deepEqual(
    offenders,
    [],
    `these files read component masters outside the transformed store: ${offenders.join(", ")}`
  );
});

test("the pill's class is declared in this site's own stylesheet", () => {
  // A class that appears in a stored tree may only be one the deployed CSS already carries.
  const css = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
  assert.match(css, /\.badge-promo\s*\{/);
});

test("the React tile renders the same wording constant, so the two tiles cannot disagree", () => {
  const card = code(path.join(SRC, "components", "product", "ProductCard.tsx"));
  assert.match(card, /PROMO_TAG_LABEL/);
  assert.match(card, /badge-promo/);
});
