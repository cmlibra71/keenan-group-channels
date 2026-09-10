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
  // `pending` is the legacy/Zoey spelling; `pending_payment` is where every new
  // unpaid order lands since the portal's status lifecycle (Trello XJo20XmX).
  // Both mean the same thing to a customer: we have the order, nothing has
  // started, and nothing has been paid — so neither may read "Being prepared".
  //
  // That rule is about the SHOPPER'S own money and it still holds in full. Since
  // card MHHjnZ0c a SilverChef or Skope Funding order carries `net_terms_account`
  // instead of `pending_payment` — an INTERNAL change, for the staff pill and the
  // net-terms bucket — and the override below keeps such an order reading "Placed"
  // here, so nothing the customer reads moved. See FINANCE_PAYMENT_METHODS.
  pending: "Placed",
  pending_payment: "Placed",

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
  awaiting_payment: "Being prepared",
  eway_authorised: "Being prepared",
  net_terms_account: "Being prepared",
  manual_verification_required: "Being prepared",
  disputed: "Being prepared",
  // PART of this order is being refunded (portal card 5xC6MBPu), which means the REST of it is
  // still ours to pack — so the customer reads the ordinary working word. Deliberately not
  // "Refunded": that is the whole-order twin `refund_in_progress` below, and telling somebody
  // their order is refunded when most of it is still coming would be the worst kind of wrong.
  // The refund itself reaches them through the credit memo's own email, not through this word.
  //
  // CONTAINMENT ONLY, as shipped: the portal derives both refund labels from the credit memo and
  // writes NEITHER to `orders.status`, so no order carries this value today and this row can never
  // fire. It is here because the containment test below requires every portal status key to map by
  // name rather than fall through, and because the day anything DOES store it the customer must
  // already be safe. Nothing about a refund in flight changes what a customer reads.
  partial_refund_in_progress: "Being prepared",
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

/**
 * Payment-method ids that mean an equipment-finance company is funding the
 * purchase: SilverChef and Skope Funding (card VAjaPj0t). Spelled out rather than
 * imported so this module stays pure and dependency-free; `@keenan/services`
 * `FINANCE_METHOD_IDS` and `lib/checkout/order-draft.ts` are the same pair.
 */
const FINANCE_PAYMENT_METHODS: ReadonlySet<string> = new Set(["silverchef", "finance"]);

/**
 * A finance order is a net-terms order INTERNALLY, and only internally.
 *
 * Card MHHjnZ0c gives SilverChef and Skope Funding orders Zoey's
 * `net_terms_account` status so staff see them in the net-terms bucket wearing the
 * net-terms pill. That status ordinarily reads "Being prepared" to a customer,
 * because a net-terms account HAS credit and the goods are worked on at once.
 *
 * A finance order is not that. The customer has applied and nobody has approved,
 * paid or picked anything yet, so telling them we are "Being prepared" the instant
 * they submit would be untrue — and the Product Brief's settled invariant (§3
 * "Statuses & wording") is that an unpaid order reads "Placed", never "Being
 * prepared". The card that moved the status is explicitly an internal-status and
 * internal-pill change, so the wording stays exactly where it was: this pair reads
 * "Placed" until a real event (payment, fulfilment, dispatch) moves the order on,
 * which is precisely what the shopper saw before the card.
 */
function isFinancePlacedButUnstarted(
  statusKey: string,
  paymentMethod: string | null | undefined
): boolean {
  if (statusKey !== "net_terms_account") return false;
  return FINANCE_PAYMENT_METHODS.has((paymentMethod ?? "").trim().toLowerCase());
}

/**
 * The one and only wording a customer sees for `orders.status`.
 *
 * `paymentMethod` is `orders.payment_method` and is optional: pass it wherever the
 * caller has the column, so a finance order keeps reading "Placed" (above). Every
 * return is still a member of ORDER_STAGES, whether it is passed or not.
 */
export function customerOrderStage(
  status: string | null | undefined,
  paymentMethod?: string | null
): OrderStage {
  const key = (status ?? "").trim().toLowerCase();
  if (!key) return FALLBACK_STAGE;
  if (isFinancePlacedButUnstarted(key, paymentMethod)) return "Placed";
  return ORDER_STAGE_BY_STATUS[key] ?? FALLBACK_STAGE;
}

/** Every status this module maps by name. Exported so the tests can sweep it. */
export const KNOWN_ORDER_STATUSES: readonly string[] = Object.freeze(
  Object.keys(ORDER_STAGE_BY_STATUS)
);
