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
  FINANCE_MIN_ORDER_INC_GST,
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_APPLICATION_INTRO,
  FINANCE_ATTACHMENT_PROMPTS,
  FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
  SILVERCHEF_METHOD_ID,
  financeAvailable,
  financeApplicationFields,
  financeApplicationInputNames,
  fundingTypesForMethod,
  isFinancePaymentMethod,
  orderWeeklyRent,
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
  /** Weekly rent for the whole order, GST inclusive, 2dp. */
  weeklyAmount: number;
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
  return {
    eligible,
    weeklyAmount: eligible ? orderWeeklyRent(input.lines) : 0,
    formKey: FINANCE_APPLICATION_FORM_KEY,
    intro: FINANCE_APPLICATION_INTRO,
    fields: financeApplicationFields().filter((f) => f.name !== "order_number"),
    fundingTypesByMethod: {
      silverchef: fundingTypesForMethod("silverchef"),
      finance: fundingTypesForMethod("finance"),
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

/** Only the SilverChef button carries a weekly figure (Tim's wording, 2026-08-11). */
export function weeklyAmountForMethod(methodId: string, offer: FinanceOffer | null): number | null {
  if (!offer?.eligible) return null;
  if (methodId !== SILVERCHEF_METHOD_ID) return null;
  return offer.weeklyAmount > 0 ? offer.weeklyAmount : null;
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
 * has to belong to the button that was pressed. The SilverChef button offers
 * only SilverChef funding types, so a posted "Traditional Finance option" under
 * it is a form that has drifted (or been hand-edited) and is refused.
 */
export function fundingTypeError(methodId: string, fundingType: string | undefined): string | null {
  const allowed = fundingTypesForMethod(methodId);
  if (!allowed.length) return null;
  if (!fundingType || !allowed.includes(fundingType))
    return "Please choose a funding type from the list.";
  return null;
}

/** The refusal a cart under the floor gets, in the shopper's words. */
export function financeFloorError(): string {
  return `Finance is available on orders of $${FINANCE_MIN_ORDER_INC_GST.toLocaleString(
    "en-AU"
  )} or more (including GST). Please choose another way to pay.`;
}
