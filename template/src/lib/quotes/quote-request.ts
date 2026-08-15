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
 */

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
  | "address_postcode_required";

/**
 * One sentence per problem, in the customer's words. The client shows it and the
 * server returns the SAME string, so a stale tab and a fresh one say the same thing.
 */
export const QUOTE_REQUEST_PROBLEM_MESSAGE: Record<QuoteRequestProblem, string> = {
  quote_name_required: "Please give this quote a name so you can find it later.",
  quote_name_too_long: `Please shorten the quote name to ${QUOTE_NAME_MAX_LENGTH} characters or fewer.`,
  address_required: "Please choose or enter a delivery address.",
  address_street_required: "Please enter the street address we should deliver to.",
  address_city_required: "Please enter the suburb or city.",
  address_state_required: "Please enter the state.",
  address_postcode_required: "Please enter the postcode.",
};

/**
 * The first thing wrong with the form, or null when it is ready to send.
 *
 * `savedAddressIds` is what the customer actually has on file: a posted id that is
 * not one of them is treated as "no address chosen" rather than trusted, so a
 * tampered or stale form cannot attach somebody else's address to a quote.
 */
export function validateQuoteRequest(
  form: QuoteRequestForm,
  savedAddressIds: readonly number[]
): QuoteRequestProblem | null {
  const name = form.quoteName.trim();
  if (!name) return "quote_name_required";
  if (name.length > QUOTE_NAME_MAX_LENGTH) return "quote_name_too_long";

  if (form.addressId !== "new") {
    return savedAddressIds.includes(form.addressId) ? null : "address_required";
  }

  const a = form.newAddress;
  if (!a.address1.trim()) return "address_street_required";
  if (!a.city.trim()) return "address_city_required";
  if (!a.state.trim()) return "address_state_required";
  if (!a.postalCode.trim()) return "address_postcode_required";
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

/** The one-line label the address dropdown shows, Zoey-style: name then address. */
export function savedAddressLabel(a: SavedQuoteAddress): string {
  const who = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  const where = [a.address1, a.city, a.stateOrProvince, a.postalCode, a.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return [who, where].filter(Boolean).join(", ");
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
 */
export function quoteShippingAddressSnapshot(
  a: QuoteRequestAddressFields & { country?: string }
): Record<string, string | null> {
  const val = (s: string | undefined) => {
    const t = (s ?? "").trim();
    return t === "" ? null : t;
  };
  return {
    first_name: val(a.firstName),
    last_name: val(a.lastName),
    company: val(a.company),
    street1: val(a.address1),
    street2: val(a.address2),
    city: val(a.city),
    region: val(a.state),
    postcode: val(a.postalCode),
    country: val(a.country) ?? countryNameFor(a.countryCode),
    country_code: val(a.countryCode) ?? "AU",
    telephone: val(a.phone),
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
