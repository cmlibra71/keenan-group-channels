// ============================================================================
// What a CUSTOMER is told an order is doing.
//
// `orders.status` is a staff column. It carries the 19 Zoey-synced values the
// business actually runs on (`eway_authorised`, `deposit_paid___backordered`,
// `po_sent_ordered`, `ship_ex_ws`, `holded`) plus the BigCommerce vocabulary the
// portal itself writes (`awaiting_fulfillment`, `partially_shipped`, …). Until
// this module existed the storefront printed that column verbatim, so a customer
// on Chef's Depot could read "awaiting_fulfillment" — or worse, the name of the
// finance company underwriting their purchase ("Silverchef", "Skope Funding",
// "Food By Us"), which is nobody's business but ours.
//
// So the storefront never renders `orders.status`. It renders the output of this
// function, which is a CLOSED set of eight plain words. Three properties follow
// from that and are asserted by the tests:
//
//   * no raw snake_case value can escape — every branch returns a member of
//     ORDER_STAGES, including the fallback;
//   * no finance-company name and no internal shorthand can escape, for the same
//     reason;
//   * a status nobody has seen before (Zoey gains one, the portal adds one) reads
//     as "Being prepared" rather than leaking itself.
//
// Pure: no React, no DB, no server-only. Importable from server components,
// client components and unit tests alike.
// ============================================================================

/** Every word a customer may read for an order's progress. Nothing else. */
export const ORDER_STAGES = [
  "Placed",
  "Being prepared",
  "On its way",
  "Partly on its way",
  "Complete",
  "On hold",
  "Cancelled",
  "Refunded",
] as const;

export type OrderStage = (typeof ORDER_STAGES)[number];

/**
 * Staff status -> customer stage.
 *
 * The key set mirrors the portal's own ORDER_STATUS_LABEL
 * (src/lib/orders/status-display.ts) so that every status the business can
 * actually put on an order is mapped DELIBERATELY, and the catch-all below is
 * reserved for genuinely new values rather than quietly swallowing known ones.
 *
 * Both spellings of the two variant statuses are listed (canceled/cancelled,
 * complete/completed) because both genuinely exist in production — Zoey-imported
 * orders and portal-created orders use different vocabularies.
 */
const ORDER_STAGE_BY_STATUS: Record<string, OrderStage> = {
  // --- placed, nothing has happened to it yet ---
  pending: "Placed",

  // --- we have it and we are working on it ---
  awaiting_fulfillment: "Being prepared",
  processing: "Being prepared",
  deposit_paid: "Being prepared",
  deposit_paid___backordered: "Being prepared",
  backorder: "Being prepared",
  po_sent_ordered: "Being prepared",
  ship_ex_ws: "Being prepared",
  awaiting_shipment: "Being prepared",
  "3pl_pending": "Being prepared",
  pending_payment: "Being prepared",
  awaiting_payment: "Being prepared",
  eway_authorised: "Being prepared",
  net_terms_account: "Being prepared",
  manual_verification_required: "Being prepared",
  disputed: "Being prepared",
  // Finance-company statuses. The customer is told the order is being prepared;
  // WHICH financier is funding it never reaches the browser.
  silverchef: "Being prepared",
  skope_funding: "Being prepared",
  food_by_us: "Being prepared",

  // --- it has left us ---
  shipped: "On its way",
  partially_shipped: "Partly on its way",

  // --- done ---
  complete: "Complete",
  completed: "Complete",
  closed: "Complete",

  // --- paused ---
  holded: "On hold",

  // --- stopped ---
  canceled: "Cancelled",
  cancelled: "Cancelled",
  declined: "Cancelled",

  // --- money returned ---
  refunded: "Refunded",
  refund_in_progress: "Refunded",
};

/**
 * The stage to show when the status is blank or unrecognised.
 *
 * "Being prepared" is the honest default: an order exists, we have it, and we
 * have not told the customer it shipped. It is deliberately NOT "Placed" — a
 * status we do not recognise is far more likely to be mid-pipeline than brand new.
 */
const FALLBACK_STAGE: OrderStage = "Being prepared";

/** The one and only wording a customer sees for `orders.status`. */
export function customerOrderStage(status: string | null | undefined): OrderStage {
  const key = (status ?? "").trim().toLowerCase();
  if (!key) return FALLBACK_STAGE;
  return ORDER_STAGE_BY_STATUS[key] ?? FALLBACK_STAGE;
}

/** Every status this module maps by name. Exported so the tests can sweep it. */
export const KNOWN_ORDER_STATUSES: readonly string[] = Object.freeze(
  Object.keys(ORDER_STAGE_BY_STATUS)
);
