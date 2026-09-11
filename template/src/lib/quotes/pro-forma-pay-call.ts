// ============================================================================
// WHERE THE PRO-FORMA SENDS THE CUSTOMER, AND WHAT IT PROMISES THEM.
//
// The pure half of `pro-forma-email.ts`, split out for the same reason
// `pay-balance.ts` is split from `pay-balance-context.ts`: this is the part that
// has to be right, and it is the part a test can actually ask.
//
// It matters more than a link usually does. On the storefront ACCOUNT
// acceptance path the pro-forma is the ONLY email the customer gets — the portal
// follow-up is told `customerAlreadyNotified` — so this button is the whole of
// what they are told about paying.
//
// TWO THINGS CHANGED IT (card isl1uwjR, Tim 2026-09-08: "If freight has been
// allocated to a quote, the customer should be allowed to convert the quote to
// an order inside their account area on the frontend or via their link"):
//
//  1. THAT PATH NOW CONVERTS. `converted_to_order` is a TERMINAL pay state on
//     the quote page (`quote-payable.ts`, card 0Wy0xHuq), so "Pay this quote"
//     pointing at `/account/quotes/<id>` would send the customer to a page whose
//     Pay control the very same request had just retired. With an order, the
//     money is paid on the ORDER.
//
//  2. NOT EVERY STOREFRONT CAN TAKE THE MONEY. Card Sh03niVC's Pay-by-card
//     control is Chefs Depot only; Industry Kitchens' copy still answers "card
//     payment not offered" (the OPEN GAP on `sf-account-orders` in
//     `customers.md`). IK's storefront is not launched and its open quotes are
//     Zoey's today, so no IK customer reaches this email yet — but the build
//     must be right for the day one does. So the verb is decided, not assumed:
//     "Pay your order" only where the channel actually offers cards, "View your
//     order" everywhere else, with the invoice sentence beside it. A promise the
//     storefront cannot keep is worse than a plain direction — the same rule the
//     portal's acknowledgement page follows when it can draw no pay control.
//
//  3. A DEPOSIT QUOTE DOES NOT CONVERT HERE AT ALL (`accountAcceptanceHoldsConversion`
//     below). Its pro-forma prints "Deposit due now $X / Balance $Y" (card
//     0Wy0xHuq), and the order's Pay control takes the WHOLE balance with no
//     partial payments (card Sh03niVC). So the acceptance holds the conversion,
//     no order id comes back, and this module draws the unconverted "Pay this
//     quote" call — which `payQuote` answers by charging the deposit and raising
//     the order.
//
// The card question is asked at CHANNEL level on purpose. An account's own
// allow-list can narrow payment further, but that is re-decided on the order
// page by `decidePayBalance`, which is where it belongs; an email cannot
// re-decide a payment, and it must not imply it has.
// ============================================================================

import { readQuoteDeposit } from "./quote-deposit";

/**
 * Does accepting THIS quote in the account area hold the conversion back, so
 * the PAYMENT raises the order (card isl1uwjR x 0Wy0xHuq x Sh03niVC)?
 *
 * Yes exactly when the rep set a deposit on it. The deposit is charged by paying
 * the QUOTE (`payQuote`); the order's Pay control only ever takes the whole
 * balance. Converting would email a pro-forma naming one amount and link it to a
 * page charging another. Keyed on the STORED deposit terms, not the resolved
 * figure: the rep asked for the money to be taken on the quote, and a deposit
 * that happens to resolve to the whole amount is still charged correctly there.
 * Every other quote converts on acceptance when it carries its delivery.
 */
export function accountAcceptanceHoldsConversion(attributes: unknown): boolean {
  return readQuoteDeposit(attributes) !== null;
}

export interface ProFormaPayCallInput {
  /** This storefront's own base URL, no trailing slash. */
  siteUrl: string;
  /** The quote, for the unconverted case. */
  quoteId: number;
  /** The order the acceptance raised, or null when it raised none. */
  convertedOrderId: number | null;
  /**
   * Does this CHANNEL offer cards to customers — `stripe` among
   * `customerPaymentMethods`, asked through the shared `cardPaymentAvailable`.
   * Only consulted when there is an order.
   */
  canPayByCard: boolean;
}

export interface ProFormaPayCall {
  /** Where the button goes. */
  href: string;
  /** What the button says. */
  label: string;
  /** The sentence under the button. Plain text; the HTML part escapes nothing else. */
  footer: string;
  /**
   * The extra sentence in the opening paragraph, or "" when there is none. An
   * acceptance that raised an order says so; one that did not stays silent
   * rather than inventing an order.
   */
  intro: string;
}

const NO_ORDER_FOOTER = "Sign in to your account to pay, or reply to this email and we'll help.";
const INVOICE_FOOTER =
  "Sign in to your account to see it. Your invoice follows by email, with everything you need to " +
  "pay it — or reply to this email and we'll help.";
const ORDER_INTRO = "Your order has been raised and is in your account.";

export function proFormaPayCall(input: ProFormaPayCallInput): ProFormaPayCall {
  const base = input.siteUrl.replace(/\/+$/, "");
  const orderId =
    typeof input.convertedOrderId === "number" &&
    Number.isFinite(input.convertedOrderId) &&
    input.convertedOrderId > 0
      ? input.convertedOrderId
      : null;

  // No order: exactly the pre-isl1uwjR document. This is not only the
  // gate-unmet case — it is also what a portal one release back produces, since
  // it does not report an order id at all, and pointing at the quote is right
  // whenever the quote has not converted.
  if (orderId === null) {
    return {
      href: `${base}/account/quotes/${input.quoteId}`,
      label: "Pay this quote",
      footer: NO_ORDER_FOOTER,
      intro: "",
    };
  }

  return {
    href: `${base}/account/orders/${orderId}`,
    label: input.canPayByCard ? "Pay your order" : "View your order",
    footer: input.canPayByCard ? NO_ORDER_FOOTER : INVOICE_FOOTER,
    intro: ORDER_INTRO,
  };
}
