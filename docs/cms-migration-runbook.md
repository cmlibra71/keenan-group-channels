# Storefront CMS Migration Runbook

How to move the storefronts from hardcoded components to data-driven CMS **blocks**,
**one component at a time, with proven pixel-parity at every step.**

Goal (per the brief): every content/presentation component on each channel site becomes
editable in the portal CMS, and after each migration the live site is **provably identical**.

---

## Current state (what's already done)

- **CMS engine is live**: Block Registry (`@keenan/services` `src/cms/registry.ts`), relational
  `cms_pages`/`cms_blocks`/`cms_page_versions` tables (applied to **prod** + `commerce_test`),
  services (`cmsPageService`/`cmsBlockService`), portal editor at `/dashboard/storefront/cms`,
  storefront `BlockRenderer` + per-fork component maps (`src/blocks/registry.tsx`), and the
  `/api/{revalidate,preview/enter,preview/exit,blocks/manifest}` routes — all deployed.
- **Secrets wired**: `STOREFRONT_REVALIDATE_SECRET`, `CMS_PREVIEW_SECRET` in both repos +
  containers. `CHANNEL_KEY` set per storefront.
- **Prod CMS content = empty** (clean slate). Storefronts render the legacy hardcoded paths.
- **Milestone / revert point**: git tag `pre-cms-migration-2026-06-30` on channels `main`.
- **Parity harness**: `scripts/parity-capture.mjs` + `scripts/parity-diff.mjs` (validated).
- **Reference implementation** of the first migration (custom content pages → `content_page`
  block) exists in the working tree (uncommitted): `src/blocks/registry.tsx` (`ContentPageBlock`
  in all 3 forks) + `src/app/pages/[slug]/page.tsx` (wrapper removed). The matching backfill is
  committed to services `main` (`scripts/cms-backfill.ts`, emits a `content_page` block).

---

## Two hard rules (learned the hard way — a violation blanked live CD pages once)

1. **Deploy the renderer BEFORE publishing any block that uses it.** A storefront build that
   doesn't know a `block_type` renders it as *nothing* in production. So: add the block
   component to the fork's `src/blocks/registry.tsx`, **deploy that build**, confirm
   `/api/blocks/manifest` lists the new type, and only THEN publish pages that use it.
2. **Verify parity against the LIVE site, never local-vs-local.** A local build can silently
   diverge from what's deployed. The baseline (“BEFORE”) must be captured from the production
   URL (or a local build first proven to match live).

---

## The parity harness

Capture full-page screenshots, then pixel-diff two sets. Same DB + same moment, only the render
path differs ⇒ any non-trivial delta is a real regression.

```bash
# Capture a set of pages (multiple widths recommended: 1280 desktop, 768 tablet, 390 mobile)
node scripts/parity-capture.mjs --base=https://chefsdepot.com.au --out=shots/before --width=1280 \
  /pages/shipping /pages/terms /pages/returns ...

# Draft-preview capture (renders unpublished CMS blocks without changing live):
CMS_PREVIEW_SECRET=<secret> node scripts/parity-capture.mjs \
  --base=http://localhost:3002 --out=shots/after --width=1280 --preview=2 /pages/shipping ...

# Diff (PASS if every page <= 0.1% pixels differ; exits non-zero on FAIL)
node scripts/parity-diff.mjs shots/before shots/after
```

Notes:
- The shell here is **zsh** — pass page paths as **explicit args**, not an unquoted `$VAR`
  (zsh doesn't word-split, so the whole list collapses into one bogus path → false 0%).
- `--preview=<channelId>` mints a token with `CMS_PREVIEW_SECRET` and enters Next draft mode, so
  you can A/B a *draft* CMS page against the live legacy render with zero customer impact.
- Validated noise floor: identical inputs = 0.0000%; live re-capture ~0.006%. Treat <0.1% as parity.

---

## The migration loop (run per component / page type, per fork)

For each item in the backlog:

1. **Build a faithful block.** Add a component to the fork's `src/blocks/registry.tsx` that
   reproduces the legacy component's markup **exactly** (same wrapper, classes, structure). Each
   fork renders its own markup — they have diverged. Add the block's field schema to the shared
   `@keenan/services` registry once (for the portal editor).
2. **Wire the page** to render the block when CMS content exists, falling back to legacy
   otherwise (see `src/app/pages/[slug]/page.tsx` for the pattern). Remove any extra wrappers
   that would shift layout vs. legacy.
3. **Typecheck** all three forks (`npx tsc --noEmit`) + a local prod `npm run build`.
4. **Deploy the renderer** (channels `main`). Confirm `/api/blocks/manifest` lists the new type.
5. **Capture BEFORE** from live (legacy render).
6. **Create the CMS page(s) as DRAFT** (live unaffected) and **capture AFTER** via `--preview`.
7. **Diff.** If not ~0%, fix the block markup until pixel-identical. *Do not proceed on a FAIL.*
8. **Publish.** Live switches to the block path (busts cache via the portal publish → /api/revalidate,
   or within the ~5-min TTL). Because parity passed, there's no visible change.
9. **Re-capture live AFTER publish** and diff against BEFORE one more time (belt-and-braces).

### Revert (any step)
- **Un-publish / delete** the `cms_pages` rows → the deployed renderer falls back to legacy.
  `DELETE FROM cms_pages WHERE channel_id=? AND slug=?;`
- If a storefront cache is stuck on a bad render, restart its container via SSM:
  `aws ssm send-command --instance-ids i-07fb3cc6aeea2eb49 --document-name AWS-RunShellScript \
   --parameters 'commands=["docker restart keenan-channel-chef-s-kitchen"]' --region ap-southeast-2`
- Full code revert point: git tag `pre-cms-migration-2026-06-30`.

---

## Ordered backlog (lowest risk → highest)

Per fork (chef-s-kitchen = ch2 = chefsdepot.com.au; industry-kitchens = ch1 = industrialkitchens.com.au).

### 1. Custom content pages — LOW  *(reference implementation ready in working tree)*
- CD: terms, contact, privacy, returns, shipping, warranty (6).
- IK: about, contact, privacy, returns, shipping, warranty, catalogue, case-study, silverchef,
  skope-finance, customer-service, terms-conditions, energy-incentives, catering-equipment-finance (14).
- Block: **`content_page`** (faithful `<article>` per fork). Source: `channel_settings.content_pages`.
- Backfill: `cd ../keenan-group-services && npx tsx scripts/cms-backfill.ts` (dry run) then
  `--execute`. It creates one `content_page` block per page and publishes v1. **Only run AFTER
  the content_page renderer is deployed** (Rule 1). Idempotent on `(channel_id, slug)`.

### 2. Footer — LOW/MED
- IK Footer is already data-driven (`FooterConfig`); CD Footer is hardcoded. Make a `footer`
  block (or per-channel footer config surface). Verify with full-page diffs of any page.

### 3. Homepage sections — MED/HIGH  *(highest-value, highest-regression-risk)*
- IK is already section-array driven (`getHomepageSections()` + `HomeSections`); register its
  section types as blocks. CD homepage is hardcoded JSX — refactor into an ordered block list.
- Use `seedHomeDocument(channelKey)` (`@keenan/services`) to reproduce each fork's current
  section order, behind a per-fork `cms_pages_enabled` flag; **gate the cutover on a zero-diff
  homepage screenshot run at 1280/768/390**.
- Blocks needed: hero, value_bar/trust_bar, banner(_carousel), category_grid/tiles,
  brand_showcase, clearance_spotlight, product_listing, membership_cta, draw_spotlight, faq,
  stats_banner, customer_logos, knowledge_hub, why_shop, specialist_cta. (Many already in the
  registry; see `src/blocks/registry.tsx` per fork for what's mapped.)

### 4. Category pages — HIGH
- Keep the system listing (FilterRail + ProductGrid + pagination) as-is; wrap it in editable
  `above_listing` / `below_listing` / `banner` regions via a `page_kind='category'` CMS page
  linked by `category_id`. Emit the (currently unused) category SEO fields. Parity-diff a
  sample of category pages.

### 5. Product pages (Steve's specific ask) — HIGH
- The product detail (gallery/options/pricing/tabs/related) is **catalog-driven**, not content.
  Approach: keep the system product component, but expose editable surrounding regions
  (above/below detail, custom tab content, promo banner) as blocks. Do NOT try to make the
  live pricing/variant logic "CMS content". Parity-diff representative product slugs per fork.

### 6. Brand pages — MED (CD) / HIGH (IK)
- IK brand pages are enriched (intro/product-lines/industry-uses/faq from metafields) — model
  those as blocks. CD brand pages are simpler.

### Out of scope (leave hardcoded)
- Cart, checkout, account/*, membership transactional flows, search results — these are
  **session/system state**, not editable content. Don't CMS-ify the checkout.

---

## Post-mortem (why this is a runbook, not a finished migration)

A first attempt published the `content_page` blocks to prod **before** the renderer that
understands them was deployed → the live CD content pages rendered empty for a few minutes.
Reverted by deleting the rows + restarting the container. Root causes, both now encoded as the
"two hard rules" above: (1) publish-before-deploy, (2) parity checked local-vs-local instead of
against live. The block design itself was correct (verified to match live IK's exact HTML).

Execute the backlog top-to-bottom, one item at a time, never skipping the live parity gate.
