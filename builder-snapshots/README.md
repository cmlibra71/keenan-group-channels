# builder-snapshots

Frozen captures of the **live production** Chef's Depot site (`chefsdepot.com.au`), taken by
`capture.cjs` before any page was converted to the Site Builder. They are the parity baseline a
converted page is compared against.

## What they are and are not

- **Structural, not factual.** Compare DOM shape, class names, layout and component structure. The
  copy, prices and availability in these files are a snapshot of one moment and drift from the live
  site immediately.
- **Not an automated gate.** Nothing diffs these files in CI; the comparison is done by a human or an
  agent. The only reference to the directory is a comment in `src/builder/seeds/product.ts`.
- **Not reproducible.** `capture.cjs` discovers pages from the live sitemap and takes the first two
  products/categories it finds, so a re-run captures different pages. Re-capturing destroys the
  baseline rather than refreshing it.

## Deliberate edits

- `pages_terms.html` — the supplier contact sentence (phone + support email) was replaced with
  `[contact details redacted]` in both the HTML and the escaped Next.js flight payload. Chef's Depot
  contact details were removed from the live site pre-launch, and this repo is public. The legal
  entity, ABN and registered office are retained, matching the live page.
- `pages_terms.desktop.png` / `.mobile.png` — deleted; they rendered the same sentence.

## Historical notes

- Prices in `products_*.html` (including the schema.org `Offer` JSON-LD) are **pre-2026-07** and
  predate the change that stopped showing member pricing to signed-out visitors. They are a record of
  the old guest experience, not a statement of current pricing.
