/**
 * Bulky-item delivery choice at checkout (card Wxjp8wpg; 27-Jul group decision).
 *
 * A cart holding any product ticked "bulky" must make the shopper choose, visually, between:
 *   curbside    — the truck puts it on the kerb; ordinary delivery, charged and paid as normal;
 *   specialised — a tail-lift/two-person/inside placement job. This CANNOT be priced from a rate
 *                 table, so choosing it captures the site's access details and HOLDS the order:
 *                 nothing is charged to Stripe, our team quotes the delivery and takes payment.
 *
 * Pure and dependency-free: the rules are shared by the client form (what to require before the
 * button enables) and by placeOrder (what to accept), so the two can never disagree.
 */

export const DELIVERY_SERVICES = ["curbside", "specialised"] as const;
export type DeliveryService = (typeof DELIVERY_SERVICES)[number];

/** Site-access answers captured when specialised delivery is chosen. */
export interface SiteAccessAnswers {
  /** Kind of premises/access — free text from a short list. */
  deliveryType?: string | null;
  /** Can a semi/rigid truck reach the delivery point? */
  truckAccessOk?: boolean | null;
  loadingDockAvailable?: boolean | null;
  forkliftAtDelivery?: boolean | null;
  twoPersonDeliveryRequired?: boolean | null;
  /** "07:00" / "15:30" — when the site accepts deliveries. */
  deliveryWindowStart?: string | null;
  deliveryWindowEnd?: string | null;
  comments?: string | null;
}

export function isDeliveryService(value: unknown): value is DeliveryService {
  return typeof value === "string" && (DELIVERY_SERVICES as readonly string[]).includes(value);
}

/** Does this choice hold the order instead of charging it? */
export function holdsPayment(service: string | null | undefined): boolean {
  return service === "specialised";
}

/**
 * Validate the delivery half of a checkout submission.
 *
 * Returns a shopper-facing message, or null when the submission is acceptable. A cart with no
 * bulky line has nothing to answer, so any stray value is simply ignored (never an error).
 */
export function validateBulkyDelivery(input: {
  hasBulkyItems: boolean;
  deliveryService: string | null | undefined;
  siteAccess?: SiteAccessAnswers;
}): string | null {
  if (!input.hasBulkyItems) return null;
  if (!isDeliveryService(input.deliveryService)) {
    return "Please choose how the bulky items on this order should be delivered.";
  }
  if (input.deliveryService === "curbside") return null;

  const a = input.siteAccess ?? {};
  if (!a.deliveryType || !a.deliveryType.trim()) {
    return "Tell us what kind of site we're delivering to so we can quote the specialised delivery.";
  }
  if (a.truckAccessOk === null || a.truckAccessOk === undefined) {
    return "Let us know whether a delivery truck can reach the site.";
  }
  const window = deliveryWindowError(a.deliveryWindowStart, a.deliveryWindowEnd);
  if (window) return window;
  return null;
}

/** Both-or-neither, and start before end. Empty is fine — the window is optional. */
export function deliveryWindowError(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();
  if (!s && !e) return null;
  if (!s || !e) return "Give both a start and an end time for your delivery window, or leave both blank.";
  if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) {
    return "Delivery window times must look like 07:00.";
  }
  if (e <= s) return "The delivery window's end time must be after its start time.";
  return null;
}

/** The choices, with the words the shopper reads. Shared so both storefronts say the same thing. */
export const DELIVERY_SERVICE_COPY: Record<
  DeliveryService,
  { title: string; blurb: string; note: string }
> = {
  curbside: {
    title: "Curbside delivery",
    blurb:
      "The driver unloads to the kerb or loading dock. You move it inside and position it yourself.",
    note: "Priced now — pay at checkout as normal.",
  },
  specialised: {
    title: "Specialised delivery",
    blurb:
      "Tail-lift, two people, stairs, tight access or placement inside. We'll ask a few questions about the site.",
    note: "We quote this delivery and contact you to arrange it — your card is not charged now.",
  },
};

/**
 * A held specialised-delivery order is the one case where "Order Confirmed" is only half the
 * story: nothing has been charged and the total the customer can see EXCLUDES a delivery we
 * haven't quoted yet. The checkout form says so before they submit; these say it on the two
 * things they keep — the confirmation page and the confirmation email — in the same words.
 */
export const SPECIALISED_HOLD_HEADING = "Nothing has been charged yet";
export const SPECIALISED_HOLD_NOTICE =
  "Nothing has been charged for this order. It includes an item that needs specialised delivery, " +
  "so the total shown does not include delivery yet — we'll quote the delivery, confirm it with " +
  "you, and take payment then.";

/**
 * Stand-in "payment method" carried on the confirmation URL + breadcrumb cookie for a held
 * order. The ORDER itself deliberately stores no payment method (it is unpaid and un-quoted);
 * this only tells the confirmation page which block to render.
 */
export const SPECIALISED_HOLD_PM = "specialised_hold";
