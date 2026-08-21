// ============================================================================
// Heading styles for the customer order pages, spelled out in utilities.
//
// The order detail page is ONE file shared by every storefront (card D045H6Zh).
// Chefs Depot's stylesheet defines component classes for these three headings
// (`.eyebrow`, `.page-title`, `.panel-title`); Industry Kitchens' does not, and
// defining them there is not an option — IK's homepage, product page, checkout
// confirmation and error pages already reference `.eyebrow` and `.page-title`
// unstyled, so introducing the classes would restyle half that site as a side
// effect of an order page.
//
// So the shared pages say the same thing in utilities instead. Every token these
// resolve against (`--font-serif`, `--font-sans`, `--color-accent-dark`,
// `--color-text-primary`) is part of the cross-site design-token contract that
// every storefront defines (`src/app/theme-contract.css`), so the rules render in
// each site's OWN type and colour without a single site-specific class.
//
// The values reproduce Chefs Depot's definitions exactly, so the live CD page
// looks the same after being shared as it did before.
// ============================================================================

/** CD `.eyebrow` — the small uppercase label above a page title. */
export const EYEBROW_CLASS =
  "font-sans font-bold uppercase tracking-[0.12em] text-[0.6875rem] text-accent-dark";

/** CD `.page-title` — the h1 on a customer page. */
export const PAGE_TITLE_CLASS =
  "font-serif font-medium tracking-[-0.01em] leading-[1.1] text-2xl sm:text-3xl text-text-primary";

/** CD `.panel-title` — the h2 above a bordered panel. */
export const PANEL_TITLE_CLASS =
  "font-serif font-medium tracking-[-0.01em] leading-[1.15] text-lg text-text-primary";
