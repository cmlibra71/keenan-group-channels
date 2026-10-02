// Per-site Zoey-parity switches. KEEP_TEXT_COLOR: keep imported product copy's TEXT COLOUR (Chris 2026-09-30, IK clearance condition
// lines that Zoey prints in red). PER-CHANNEL on purpose — deliberately NOT in
// orchestrator/shared-modules.json. Only `color` as a named or hex value survives
// (`safeTextColor` in @keenan/services product-page/bridge); every other inline style is still
// dropped. ON for Industry Kitchens only; Chefs Depot and the template carry the same file set to false.
export const KEEP_TEXT_COLOR = false;

// Weekly rent on a $0 quote-only product whose REQUIRED Zoey option carries the price (Chris
// 2026-09-30, SKOPE Fridge Extended Warranty 29797: Zoey prints "Own Me $1.80 a week" off the
// $215 option). The option prices are already on the page, so the figure publishes nothing
// hidden. See `requiredOptionFinancePrice` in lib/finance/product-finance.ts.
export const FINANCE_FROM_REQUIRED_OPTION = false;
