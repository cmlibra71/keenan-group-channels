/**
 * What a customer must tell us when they send a quote request (card 9tbz3sBF).
 *
 * Zoey's own "Submit Your Quote Request" form asks three things beyond the items:
 * a Quote Name (required), free-text Quote Comments, and a Delivery Address —
 * picked from the address book or typed fresh. Steve settled the rules on the card
 * (2026-07-26 / 2026-07-28): the name is compulsory and reads back in My Account,
 * the address is REQUIRED at quote stage, a typed one is saved for next time, no
 * billing address is captured, and the request locks once submitted.
 *
 * The rules live here, as pure functions, because three copies of the form ship
 * (template plus both sites) and the server action must refuse exactly what the
 * button refuses — a client-side-only rule is not a rule.
 *
 * THE AUSTRALIAN ADDRESS RULES ARE THE CHECKOUT'S, NOT A SECOND SET. This is the
 * third writer into `customer_addresses` (checkout and the account address book are
 * the other two) and the address it captures becomes the quote's Ship-To and then
 * the ORDER's Ship-To, which is where freight is priced. Cards 18PbOwaG / xqWftDcL
 * put AU normalisation on every one of those writers after junk states and junk
 * postcodes matched no shipping zone and were billed as $0 delivery. So an AU state
 * must normalise to one of the 8 codes and a postcode must be 4 digits — here, on
 * the button and in `submitQuote` — with the SAME refusal wording checkout uses, and
 * the normalised code is what gets stored. Zoey's own screenshot on this card shows
 * the state as "Victoria", so the un-normalised value is the realistic input, not a
 * corner case.
 */

import { AU_STATES, isValidAuPostcode, normaliseAuState } from "../checkout/au-address";

export { AU_STATES, normaliseAuState };

/** The delivery address as the form collects it. */
export type QuoteRequestAddressFields = {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  /** State / province, e.g. "VIC". */
  state: string;
  postalCode: string;
  /** ISO-2. The autocomplete supplies it; "AU" when nothing did. */
  countryCode: string;
};

export const EMPTY_QUOTE_REQUEST_ADDRESS: QuoteRequestAddressFields = {
  firstName: "",
  lastName: "",
  company: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  countryCode: "AU",
};

/** The whole form. `addressId` is a saved address, or "new" for the typed one. */
export type QuoteRequestForm = {
  quoteName: string;
  comments: string;
  addressId: number | "new";
  newAddress: QuoteRequestAddressFields;
};

/** `quotes.quote_name` is varchar(255) — refuse politely rather than let Postgres do it. */
export const QUOTE_NAME_MAX_LENGTH = 255;

export type QuoteRequestProblem =
  | "quote_name_required"
  | "quote_name_too_long"
  | "address_required"
  | "address_street_required"
  | "address_city_required"
  | "address_state_required"
  | "address_postcode_required"
  | "address_state_invalid"
  | "address_postcode_invalid"
  | "saved_address_needs_details";

/**
 * One sentence per problem, in the customer's words. The client shows it and the
 * server returns the SAME string, so a stale tab and a fresh one say the same thing.
 *
 * The two AU sentences are WORD FOR WORD the checkout's
 * (`lib/actions/checkout.ts`, `lib/actions/account.ts`): one rule, told to the
 * customer the same way wherever they meet it.
 */
export const QUOTE_REQUEST_PROBLEM_MESSAGE: Record<QuoteRequestProblem, string> = {
  quote_name_required: "Please give this quote a name so you can find it later.",
  quote_name_too_long: `Please shorten the quote name to ${QUOTE_NAME_MAX_LENGTH} characters or fewer.`,
  address_required: "Please choose or enter a delivery address.",
  address_street_required: "Please enter the street address we should deliver to.",
  address_city_required: "Please enter the suburb or city.",
  address_state_required: "Please enter the state.",
  address_postcode_required: "Please enter the postcode.",
  address_state_invalid: "Please select an Australian state or territory from the list.",
  address_postcode_invalid: "Please enter a valid 4-digit Australian postcode.",
  saved_address_needs_details:
    "That saved address is missing a valid state or postcode, so we can't work out delivery for it. Please pick another address or enter a new one.",
};

/**
 * The country a quote address is in. Blank means Australia: both storefronts are
 * Australian B2B and the drawer has no country control, so the only way a non-AU
 * code arrives is Google's autocomplete on a NZ address (IK sells into NZ).
 */
export function quoteAddressCountryCode(a: { countryCode?: string | null }): string {
  return (a.countryCode ?? "").trim().toUpperCase() || "AU";
}

/**
 * May this typed address be FILED in the customer's address book?
 *
 * The address book is AU only — that is why the checkout's "Save this address for
 * next time" tick disappears for a non-AU country (`sf-checkout`, cards 18PbOwaG /
 * xqWftDcL). A NZ delivery address is perfectly good for THIS quote; it just does
 * not get saved, and the drawer therefore does not promise that it will be.
 */
export function mayFileQuoteAddressInBook(a: { countryCode?: string | null }): boolean {
  return quoteAddressCountryCode(a) === "AU";
}

/**
 * True when a SAVED address cannot be used for an Australian delivery as it stands.
 *
 * Same test the checkout applies to a saved address (`auAddressNeedsCorrection`),
 * which chips it "Needs details" rather than passing it through — about 94 of ~14.9k
 * AU rows are in that state. The drawer has no inline editor, so here it is labelled
 * in the dropdown and refused on submit; the way out is "Enter a new address…".
 */
export function savedQuoteAddressNeedsDetails(a: SavedQuoteAddress): boolean {
  if (quoteAddressCountryCode(a) !== "AU") return false;
  return !normaliseAuState(a.stateOrProvince) || !isValidAuPostcode(a.postalCode);
}

/**
 * The first thing wrong with the form, or null when it is ready to send.
 *
 * `savedAddresses` is what the customer actually has on file: a posted id that is
 * not one of them is treated as "no address chosen" rather than trusted, so a
 * tampered or stale form cannot attach somebody else's address to a quote. The rows
 * (not just their ids) are needed because a saved AU address that fails the state /
 * postcode rules is refused here too.
 */
export function validateQuoteRequest(
  form: QuoteRequestForm,
  savedAddresses: readonly SavedQuoteAddress[]
): QuoteRequestProblem | null {
  const name = form.quoteName.trim();
  if (!name) return "quote_name_required";
  if (name.length > QUOTE_NAME_MAX_LENGTH) return "quote_name_too_long";

  if (form.addressId !== "new") {
    const chosen = savedAddresses.find((a) => a.id === form.addressId);
    if (!chosen) return "address_required";
    return savedQuoteAddressNeedsDetails(chosen) ? "saved_address_needs_details" : null;
  }

  const a = form.newAddress;
  if (!a.address1.trim()) return "address_street_required";
  if (!a.city.trim()) return "address_city_required";
  if (!a.state.trim()) return "address_state_required";
  if (!a.postalCode.trim()) return "address_postcode_required";
  // AU only: we have no region list for anywhere else, and the rate cards are
  // AU-postcode based (same reasoning as `au-address.ts`).
  if (quoteAddressCountryCode(a) === "AU") {
    if (!normaliseAuState(a.state)) return "address_state_invalid";
    if (!isValidAuPostcode(a.postalCode)) return "address_postcode_invalid";
  }
  return null;
}

/** A saved address row, in the shape the storefront reads them in. */
export type SavedQuoteAddress = {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  countryCode: string;
};

/**
 * The one-line label the address dropdown shows, Zoey-style: name then address.
 *
 * A row we cannot price freight against says so in the label, so the customer can
 * see WHICH address the refusal is about — the checkout's "Needs details" chip, in
 * the one line a `<select>` gives us.
 */
export function savedAddressLabel(a: SavedQuoteAddress): string {
  const who = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  const where = [a.address1, a.city, a.stateOrProvince, a.postalCode, a.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const label = [who, where].filter(Boolean).join(", ");
  return savedQuoteAddressNeedsDetails(a) ? `${label} — needs details` : label;
}

/**
 * The address as it is STORED on the quote (`quotes.shipping_address`, jsonb).
 *
 * The key style is the quote editor's own (`street1` / `region` / `postcode` /
 * `telephone`), which is what the portal's `normalizeQuoteAddress` treats as
 * canonical and what the quote screen, the customer's copy, the printed copy and
 * conversion all read. Writing the orders key style here would render a blank
 * street on the quote (card iJfNIFn9).
 *
 * Empty fields are stored as null, not "", so `hasAddress` cannot read a blank
 * object as a real address.
 *
 * An AUSTRALIAN state is stored NORMALISED ("Victoria" becomes "VIC"), because this
 * snapshot is the quote's Ship-To and is copied onto the ORDER at conversion, where
 * the shipping rate card matches on state and postcode. `validateQuoteRequest` has
 * already refused anything that will not normalise, so the raw fallback here only
 * ever fires for a non-AU address.
 */
export function quoteShippingAddressSnapshot(
  a: QuoteRequestAddressFields & { country?: string }
): Record<string, string | null> {
  const val = (s: string | undefined) => {
    const t = (s ?? "").trim();
    return t === "" ? null : t;
  };
  const isAu = quoteAddressCountryCode(a) === "AU";
  return {
    first_name: val(a.firstName),
    last_name: val(a.lastName),
    company: val(a.company),
    street1: val(a.address1),
    street2: val(a.address2),
    city: val(a.city),
    region: (isAu ? normaliseAuState(a.state) : null) ?? val(a.state),
    postcode: val(a.postalCode),
    country: val(a.country) ?? countryNameFor(a.countryCode),
    country_code: val(a.countryCode) ?? "AU",
    telephone: val(a.phone),
  };
}

/**
 * The delivery address as the ADDRESS BOOK stores it — normalised the same way the
 * snapshot is, so the row filed for next time and the row on the quote agree.
 *
 * `submitQuote` files this, not the raw form, which is what makes this the third
 * address writer that obeys the AU rules rather than the one that skips them.
 */
export function quoteAddressBookRow(
  a: QuoteRequestAddressFields & { country?: string }
): {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  countryCode: string;
} {
  const snap = quoteShippingAddressSnapshot(a);
  return {
    firstName: (a.firstName ?? "").trim(),
    lastName: (a.lastName ?? "").trim(),
    company: (a.company ?? "").trim(),
    phone: (a.phone ?? "").trim(),
    address1: (a.address1 ?? "").trim(),
    address2: (a.address2 ?? "").trim(),
    city: (a.city ?? "").trim(),
    stateOrProvince: snap.region ?? "",
    postalCode: (a.postalCode ?? "").trim(),
    country: snap.country ?? "Australia",
    countryCode: snap.country_code ?? "AU",
  };
}

/** The same snapshot built from a saved address row. */
export function quoteShippingAddressFromSaved(a: SavedQuoteAddress): Record<string, string | null> {
  return quoteShippingAddressSnapshot({
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    phone: a.phone,
    address1: a.address1,
    address2: a.address2,
    city: a.city,
    state: a.stateOrProvince,
    postalCode: a.postalCode,
    countryCode: a.countryCode || "AU",
    country: a.country,
  });
}

/**
 * The country NAME for a code, for the handful the storefronts sell into.
 *
 * The address book stores the pair ("Australia" / "AU") and the printed quote reads
 * the name, so a snapshot carrying only the code prints a bare "AU". Anything we do
 * not know falls back to the code itself rather than to nothing.
 */
export function countryNameFor(code: string | null | undefined): string {
  const c = (code ?? "").trim().toUpperCase();
  const known: Record<string, string> = {
    AU: "Australia",
    NZ: "New Zealand",
  };
  return known[c] ?? (c || "Australia");
}
