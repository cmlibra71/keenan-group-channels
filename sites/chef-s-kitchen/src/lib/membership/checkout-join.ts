/**
 * Joining the membership FROM THE CHECKOUT — the pure half. Card pktBo874.
 *
 * Tim's storyboard (twelve screenshots, Myer's checkout as the stated reference) puts the join in
 * the empty space under the Order Summary card: a tick box that opens a short details panel, then
 * an emailed activation link, a prefilled page that asks for a new password, a details check, an
 * optional birthday, an "all set" page and a welcome email.
 *
 * Everything here is pure so the checkout PAGE, the CheckoutForm and `placeOrder` can agree about
 * what was asked for. The rule that matters most on this surface is the one in the register:
 * **nothing here charges anybody.** The tick captures an intention and emails a link; the
 * membership itself is confirmed with a card on the existing subscribe page. Every sentence this
 * module produces has to stay true to that, because it sits beside a Pay Now button.
 */

/** The checkbox's form field. One name, shared by the panel and `placeOrder`. */
export const MEMBERSHIP_JOIN_FIELD = "join_membership";
/** The optional birthday's form field. */
export const MEMBERSHIP_DOB_FIELD = "membership_dob";

/** How long the emailed activation link lives. It arrives with an order, not with a click. */
export const MEMBERSHIP_ACTIVATION_TTL_DAYS = 7;
export const MEMBERSHIP_ACTIVATION_TTL_MINUTES = MEMBERSHIP_ACTIVATION_TTL_DAYS * 24 * 60;

/**
 * Tim's own checkout copy for the join pitch, verbatim (card Nyp8bkPm, `05-widget-kit.html`).
 *
 * Do NOT replace it with a saving figure. The amber banner this panel grew out of used to read
 * "Members save up to $X on this order", X being the basket times a flat
 * `member_savings_percentage`; that figure was deleted because Tim's model prices a member by
 * interpolating between two trade prices whose spread differs SKU by SKU, so no single percentage
 * describes a basket, and his compliance note requires a published claim to survive an Australian
 * Consumer Law substantiation challenge. The order-exclusive phrasing is deliberate too:
 * membership reprices from the NEXT order, not this one.
 */
export const MEMBERSHIP_JOIN_PITCH =
  "Join the buying group and every line reprices from your next order.";

/**
 * The one sentence that has to be true beside a Pay Now button: ticking Join does not charge
 * anything with this order. Rendered in the panel AND repeated in the activation email.
 */
export const MEMBERSHIP_JOIN_NOTHING_CHARGED =
  "Nothing is charged with this order — we'll email you a link to set a password and start your membership.";

/** Did the posted form ask to join? Read identically by the page and by `placeOrder`. */
export function wantsMembershipJoin(value: FormDataEntryValue | string | null | undefined): boolean {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "on" || v === "true" || v === "yes";
}

/**
 * Read a birthday the shopper typed as DD/MM/YYYY (Tim's screenshot shows that placeholder) or as
 * an ISO date (what a native `<input type="date">` posts), and return it as `YYYY-MM-DD`.
 *
 * Returns null for anything unusable, and the CALLER treats null as "not given" rather than as an
 * error: the birthday is optional on Tim's own screenshot ("Birthday (Not required — could swap)"),
 * so a typo must never stop an order or a join. Deliberately strict about the calendar — 31/02
 * is not a date — because a value we cannot trust is worse than no value on a birthday reward.
 */
export function normaliseDateOfBirth(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;

  let day: number;
  let month: number;
  let year: number;

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(raw);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Real calendar check — Date rolls 31 February over to 3 March, which would store a birthday
  // the customer never typed.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  // A birthday in the future, or one implying an impossible age, is a typo.
  const thisYear = new Date().getUTCFullYear();
  if (year < thisYear - 120 || year > thisYear) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** `1975-04-01` back to the `01/04/1975` a shopper typed, for prefilling the activation page. */
export function formatDateOfBirth(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * What the panel says the membership costs, in the SAME words and off the SAME figure the
 * `/membership` page uses — `plan.price` and `plan.billing_interval`. Deliberately no GST claim of
 * its own: the storefront's own membership page makes none, and two of our screens disagreeing
 * about whether a price includes GST is worse than neither saying.
 */
export function planPriceLine(
  price: number | string | null | undefined,
  interval: string | null | undefined
): string | null {
  const amount = typeof price === "string" ? parseFloat(price) : price;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const every = (interval || "month").trim().toLowerCase();
  const word = every === "year" ? "year" : every === "week" ? "week" : every;
  return `$${amount.toFixed(2)} per ${word}`;
}

/** The join a checkout submitted, once the server has read it off the form. */
export interface MembershipJoinIntent {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string | null;
}

/**
 * Build the join from what the checkout posted. Returns null when there is nothing to act on —
 * the box was not ticked, or there is no usable email to send an activation link to.
 *
 * The email is the ONLY hard requirement: the whole journey is an emailed link, so a join with
 * nowhere to send it is not a join. Everything else is best-effort prefill for the activation page.
 */
export function membershipJoinIntent(input: {
  joinTicked: boolean;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
}): MembershipJoinIntent | null {
  if (!input.joinTicked) return null;
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return {
    email,
    firstName: (input.firstName ?? "").trim(),
    lastName: (input.lastName ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    dateOfBirth: normaliseDateOfBirth(input.dateOfBirth ?? null),
  };
}
