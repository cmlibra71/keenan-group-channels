// ============================================================================
// SilverChef and Finance at the checkout (card VAjaPj0t).
//
// The rule (Tim, 2026-08-11): both are offered as PAYMENT METHODS, the
// SilverChef button carries the weekly rent for the whole order, the same
// in-site application form serves both with different funding-type questions,
// and neither appears at all under $1,000 inc GST (below that the answer is
// Afterpay, which is not integrated yet — so below the floor nothing
// finance-shaped is drawn).
//
// Picking either PLACES THE ORDER UNPAID, exactly as Bank Transfer does today:
// nothing is charged, the application is filed and the rep is told, and staff
// record the payment when the finance settles.
//
// SHOW EQUALS ACCEPT. The checkout page draws what `financeOfferForCart` says
// and `placeOrder` authorises against the SAME function — a cart that drops
// under the floor between render and submit is refused, not quietly financed.
// The arithmetic and the field list live in @keenan/services so the product
// page and the quote figure cannot compute them differently.
// ============================================================================

// PURE subpath only. `@keenan/services/services` would drag the whole service
// barrel (ProductImageService → sharp) into the browser bundle through
// CheckoutForm and 500 the checkout.
import { gstSplit } from "@keenan/services/calc";
import {
  FINANCE_METHOD_ID,
  FINANCE_MIN_ORDER_INC_GST,
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_APPLICATION_INTRO,
  FINANCE_ATTACHMENT_PROMPTS,
  FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
  SILVERCHEF_METHOD_ID,
  financeAvailable,
  financeApplicationFields,
  financeApplicationInputNames,
  formatFinanceMoney,
  fundingTypesForMethod,
  isFinancePaymentMethod,
  isSkopeOnly,
  silverchefWeeklyRent,
  skopeWeeklyRent,
  type FinanceLine,
  type FormFieldDef,
} from "@keenan/services/finance";

export {
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_MIN_ORDER_INC_GST,
  isFinancePaymentMethod,
};

/** Cart rows as this module reads them (a subset of cartService.getWithItems). */
export interface FinanceCartLine {
  quantity: number;
  list_price: string | null;
  sale_price: string | null;
  product_sku?: string | null;
  variant_sku?: string | null;
}

/** Everything the checkout needs to draw and validate the finance options. */
export interface FinanceOffer {
  /** False = draw nothing finance-shaped, and refuse a finance submission. */
  eligible: boolean;
  /**
   * SilverChef's own weekly rent for the WHOLE basket at SilverChef's rate,
   * GST inclusive, 2dp. This is what the SilverChef button quotes.
   */
  silverchefWeekly: number;
  /**
   * SKOPE Funding's weekly figure, or null when the basket is not all SKOPE.
   * A separate offer with a separate label — never blended into SilverChef's.
   */
  skopeWeekly: number | null;
  /** True when every priced line is a SKOPE SKU, so SKOPE funding is on offer. */
  skopeOnly: boolean;
  formKey: string;
  intro: string;
  fields: FormFieldDef[];
  /** Funding types per checkout button — the SilverChef button carries only its own. */
  fundingTypesByMethod: Record<string, string[]>;
  /** The one funding-type answer that asks for a SilverChef account number. */
  accountNumberTrigger: string;
  attachmentPrompts: { name: string; label: string; hint: string }[];
}

/**
 * Per-line inc-GST totals. GST math goes through `gstSplit` (services D4) — the
 * `/1.1` formula is never re-implemented at a call site.
 */
export function financeLinesFromCart(
  items: readonly FinanceCartLine[],
  pricesIncludeTax: boolean
): FinanceLine[] {
  return items.map((item) => {
    const unit = item.sale_price ? parseFloat(item.sale_price) : parseFloat(item.list_price ?? "0");
    const lineTotal = (Number.isFinite(unit) ? unit : 0) * item.quantity;
    return {
      amountIncGst: gstSplit(lineTotal, pricesIncludeTax).incTax,
      sku: item.variant_sku ?? item.product_sku ?? null,
    };
  });
}

/**
 * The offer for one cart. `goodsTotalIncGst` is the GOODS total — delivery is
 * deliberately excluded from the weekly figure (Steve, card H7IJD8ym: "on the
 * goods total only"), and it is also what the $1,000 floor is measured on, so
 * the offer cannot appear and disappear as a postcode changes the freight.
 */
export function financeOfferForCart(input: {
  lines: readonly FinanceLine[];
  goodsTotalIncGst: number;
}): FinanceOffer {
  const eligible = financeAvailable(input.goodsTotalIncGst);
  // SKOPE Funding is a DIFFERENT offer from SilverChef's, not a cheaper rate
  // inside it: the live IK site quotes them separately ("Rent per Week: $X" vs
  // "Own Me $X a week") and the funding type is labelled "Skope Brands only".
  // So SilverChef quotes the whole basket at its own rate, and SKOPE appears
  // only on a basket it can actually fund.
  const skopeOnly = eligible && isSkopeOnly(input.lines);
  return {
    eligible,
    silverchefWeekly: eligible ? silverchefWeeklyRent(input.lines) : 0,
    skopeWeekly: skopeOnly ? skopeWeeklyRent(input.lines) : null,
    skopeOnly,
    formKey: FINANCE_APPLICATION_FORM_KEY,
    intro: FINANCE_APPLICATION_INTRO,
    fields: financeApplicationFields().filter((f) => f.name !== "order_number"),
    fundingTypesByMethod: {
      [SILVERCHEF_METHOD_ID]: fundingTypesForMethod(SILVERCHEF_METHOD_ID, skopeOnly),
      [FINANCE_METHOD_ID]: fundingTypesForMethod(FINANCE_METHOD_ID, skopeOnly),
    },
    accountNumberTrigger: FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
    attachmentPrompts: [...FINANCE_ATTACHMENT_PROMPTS],
  };
}

/** Drop the finance methods from a payment list when this cart can't be financed. */
export function filterFinanceMethods<T extends { id: string }>(
  methods: readonly T[],
  eligible: boolean
): T[] {
  return methods.filter((m) => eligible || !isFinancePaymentMethod(m.id));
}

/** What a checkout button says about the weekly cost, if anything. */
export interface WeeklyBadge {
  /** The whole phrase, already formatted — "Rent per Week: $1,269.23". */
  text: string;
  /** Small print under it, or null. */
  note: string | null;
}

/**
 * The weekly figure on ONE button, in that offer's own words.
 *
 * SilverChef and SKOPE are two offers, not one number with two rates, and the
 * live IK site labels them differently ("Rent per Week: $X" against "Own Me $X
 * a week"). Printing a SKOPE-discounted blend under the SilverChef label quotes
 * a rent SilverChef does not offer, so:
 *   - the SilverChef button quotes the whole basket at SilverChef's rate;
 *   - the Finance button carries the SKOPE figure ONLY on an all-SKOPE basket,
 *     which is the only basket "Skope Funding (Skope Brands only)" can fund —
 *     and on any other basket that funding type is not offered either.
 */
export function weeklyBadgeForMethod(methodId: string, offer: FinanceOffer | null): WeeklyBadge | null {
  if (!offer?.eligible) return null;
  if (methodId === SILVERCHEF_METHOD_ID) {
    return offer.silverchefWeekly > 0
      ? { text: `Rent per Week: ${formatFinanceMoney(offer.silverchefWeekly)}`, note: null }
      : null;
  }
  if (methodId === FINANCE_METHOD_ID && offer.skopeOnly && (offer.skopeWeekly ?? 0) > 0) {
    return {
      text: `Own Me ${formatFinanceMoney(offer.skopeWeekly!)} a week`,
      note: "Skope Funding — indicative only, subject to approval.",
    };
  }
  return null;
}

/** The weekly figure stamped on the ORDER for the method that was chosen. */
export function weeklyAmountForMethod(methodId: string, offer: FinanceOffer | null): number | null {
  if (!offer?.eligible) return null;
  if (methodId === SILVERCHEF_METHOD_ID) return offer.silverchefWeekly > 0 ? offer.silverchefWeekly : null;
  if (methodId === FINANCE_METHOD_ID && offer.skopeOnly) return offer.skopeWeekly ?? null;
  return null;
}

/** The application answers posted with the order, in the field contract's own names. */
export function financeApplicationValues(read: (name: string) => string | null): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of financeApplicationInputNames()) {
    const raw = read(`finance_${name}`);
    if (raw != null) values[name] = raw.trim();
  }
  return values;
}

/**
 * The one cross-check the field contract can't make on its own: a funding type
 * has to belong to the button that was pressed, AND to this basket. The
 * SilverChef button offers only SilverChef funding types, so a posted
 * "Traditional Finance option" under it is a form that has drifted (or been
 * hand-edited) and is refused; likewise "Skope Funding (Skope Brands only)" on
 * a basket that is not all SKOPE. Authorised against the SAME offer the page
 * drew the list from.
 */
export function fundingTypeError(
  methodId: string,
  fundingType: string | undefined,
  offer: FinanceOffer | null
): string | null {
  const allowed = offer?.fundingTypesByMethod[methodId] ?? fundingTypesForMethod(methodId);
  if (!allowed.length) return null;
  if (!fundingType || !allowed.includes(fundingType))
    return "Please choose a funding type from the list.";
  return null;
}

/**
 * One upload session id for a checkout's attachments.
 *
 * MUST match the upload route's `TOKEN_RE` (`/^[0-9a-f-]{36}$/i`) — a token that
 * doesn't is rejected with "Invalid upload session." and every photo upload dies.
 * `crypto.randomUUID` needs a SECURE CONTEXT, so it is genuinely absent on an
 * http:// origin and in some in-app browsers; the fallback therefore builds the
 * same 36-character uuid shape from `Math.random` rather than falling back to
 * something the route will refuse. Uniqueness is all this needs: the token only
 * has to be unguessable enough not to collide with a concurrent checkout, and
 * the submission claims its files immediately.
 */
export function newUploadToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((Math.floor(Math.random() * 4) + 8) % 16).toString(16)}${hex(
    3
  )}-${hex(12)}`;
}

/** The refusal a cart under the floor gets, in the shopper's words. */
export function financeFloorError(): string {
  return `Finance is available on orders of $${FINANCE_MIN_ORDER_INC_GST.toLocaleString(
    "en-AU"
  )} or more (including GST). Please choose another way to pay.`;
}
