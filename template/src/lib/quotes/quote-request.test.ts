import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_QUOTE_REQUEST_ADDRESS,
  QUOTE_NAME_MAX_LENGTH,
  QUOTE_REQUEST_PROBLEM_MESSAGE,
  countryNameFor,
  mayFileQuoteAddressInBook,
  quoteAddressBookRow,
  quoteShippingAddressFromSaved,
  quoteShippingAddressSnapshot,
  savedAddressLabel,
  savedQuoteAddressNeedsDetails,
  validateQuoteRequest,
  type QuoteRequestForm,
  type SavedQuoteAddress,
} from "./quote-request";

/**
 * What this guards: the quote request form used to ask for one optional note and
 * nothing else, so a request arrived with no name, no comment and no delivery
 * address and a rep had to phone for all three (card 9tbz3sBF). These are the rules
 * the button and the server action BOTH apply — they are the same function, so the
 * form cannot promise something the action then refuses, or vice versa.
 *
 * The Australian state and postcode rules are the CHECKOUT's (cards 18PbOwaG /
 * xqWftDcL). This form is the third writer into `customer_addresses` and the address
 * it captures becomes the quote's Ship-To and then the ORDER's Ship-To, which is
 * where freight is priced: a junk state matches no shipping zone and used to be
 * billed as $0 delivery. Zoey's own screenshot on this card shows the state as
 * "Victoria", so the full NAME is the realistic input — it is accepted and stored as
 * "VIC"; anything that is not one of the eight is refused with no fallback.
 */

const filledAddress = {
  firstName: "Tim",
  lastName: "Keenan",
  company: "Tims Chicken Shop",
  phone: "0400 000 000",
  address1: "100 New St",
  address2: "Unit 3",
  city: "Ringwood",
  state: "VIC",
  postalCode: "3134",
  countryCode: "AU",
};

const savedRow = (over: Partial<SavedQuoteAddress> = {}): SavedQuoteAddress => ({
  id: 7,
  firstName: "Tim",
  lastName: "Keenan",
  company: "",
  phone: "",
  address1: "100 New St",
  address2: "",
  city: "Ringwood",
  stateOrProvince: "VIC",
  postalCode: "3134",
  country: "Australia",
  countryCode: "AU",
  ...over,
});

const book = (...rows: SavedQuoteAddress[]) => rows;

const form = (over: Partial<QuoteRequestForm> = {}): QuoteRequestForm => ({
  quoteName: "New kitchen fit-out",
  comments: "",
  addressId: 7,
  newAddress: EMPTY_QUOTE_REQUEST_ADDRESS,
  ...over,
});

describe("validateQuoteRequest — the quote name", () => {
  test("is compulsory (Steve, 2026-07-26: 'It should be compulsory')", () => {
    assert.equal(
      validateQuoteRequest(form({ quoteName: "" }), book(savedRow())),
      "quote_name_required"
    );
  });

  test("counts whitespace as nothing", () => {
    assert.equal(
      validateQuoteRequest(form({ quoteName: "   " }), book(savedRow())),
      "quote_name_required"
    );
  });

  test("is refused politely past the column's own limit rather than by Postgres", () => {
    assert.equal(
      validateQuoteRequest(
        form({ quoteName: "x".repeat(QUOTE_NAME_MAX_LENGTH + 1) }),
        book(savedRow())
      ),
      "quote_name_too_long"
    );
    assert.equal(
      validateQuoteRequest(form({ quoteName: "x".repeat(QUOTE_NAME_MAX_LENGTH) }), book(savedRow())),
      null
    );
  });
});

describe("validateQuoteRequest — the delivery address", () => {
  test("a saved address the customer really has is accepted", () => {
    assert.equal(
      validateQuoteRequest(form({ addressId: 7 }), book(savedRow({ id: 3 }), savedRow())),
      null
    );
  });

  test("an id the customer does NOT have reads as no address, never as trusted", () => {
    // The whole point: a tampered or stale form must not attach a stranger's address.
    assert.equal(
      validateQuoteRequest(form({ addressId: 999 }), book(savedRow({ id: 3 }), savedRow())),
      "address_required"
    );
  });

  test("a customer with no saved addresses must type one", () => {
    assert.equal(validateQuoteRequest(form({ addressId: 7 }), []), "address_required");
  });

  test("a typed address needs a street, a suburb, a state and a postcode", () => {
    const typed = (over: Partial<typeof filledAddress>) =>
      validateQuoteRequest(form({ addressId: "new", newAddress: { ...filledAddress, ...over } }), []);
    assert.equal(typed({ address1: "" }), "address_street_required");
    assert.equal(typed({ city: "" }), "address_city_required");
    assert.equal(typed({ state: "" }), "address_state_required");
    assert.equal(typed({ postalCode: "" }), "address_postcode_required");
    assert.equal(typed({}), null);
  });

  test("a typed address needs no company or second line — most sites have neither", () => {
    assert.equal(
      validateQuoteRequest(
        form({ addressId: "new", newAddress: { ...filledAddress, company: "", address2: "" } }),
        []
      ),
      null
    );
  });
});

describe("validateQuoteRequest — the Australian rules the checkout enforces", () => {
  const typed = (over: Partial<typeof filledAddress>) =>
    validateQuoteRequest(form({ addressId: "new", newAddress: { ...filledAddress, ...over } }), []);

  test("refuses a state that is not one of the eight — no fallback to the raw value", () => {
    assert.equal(typed({ state: "North Eastern Australia" }), "address_state_invalid");
    assert.equal(typed({ state: "Vic." }), "address_state_invalid");
    assert.equal(typed({ state: "3134" }), "address_state_invalid");
  });

  test("accepts the full state NAME and stores the code — 'Victoria' is Zoey's own screenshot", () => {
    assert.equal(typed({ state: "Victoria" }), null);
    assert.equal(
      quoteShippingAddressSnapshot({ ...filledAddress, state: "Victoria" }).region,
      "VIC"
    );
  });

  test("refuses a postcode that is not four digits", () => {
    assert.equal(typed({ postalCode: "31345" }), "address_postcode_invalid");
    assert.equal(typed({ postalCode: "1616846841" }), "address_postcode_invalid");
    assert.equal(typed({ postalCode: "31a4" }), "address_postcode_invalid");
  });

  test("accepts the eight state codes, in any case", () => {
    for (const code of ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"]) {
      assert.equal(typed({ state: code }), null, code);
      assert.equal(typed({ state: code.toLowerCase() }), null, code);
    }
  });

  test("says it in the checkout's own words, so one rule reads the same everywhere", () => {
    assert.equal(
      QUOTE_REQUEST_PROBLEM_MESSAGE.address_state_invalid,
      "Please select an Australian state or territory from the list."
    );
    assert.equal(
      QUOTE_REQUEST_PROBLEM_MESSAGE.address_postcode_invalid,
      "Please enter a valid 4-digit Australian postcode."
    );
  });

  test("leaves a NON-Australian address its free-text region — we have no list for NZ", () => {
    assert.equal(
      typed({ countryCode: "NZ", state: "Auckland", postalCode: "1010" }),
      null
    );
  });

  test("a SAVED address that fails the rules is refused, not silently passed through", () => {
    // The checkout chips such a row "Needs details" and re-opens the form; the drawer
    // has no inline editor, so it refuses and the way out is "Enter a new address".
    const junk = savedRow({ stateOrProvince: "North Eastern Australia" });
    assert.equal(validateQuoteRequest(form({ addressId: 7 }), book(junk)), "saved_address_needs_details");
    assert.equal(
      validateQuoteRequest(form({ addressId: 7 }), book(savedRow({ postalCode: "313" }))),
      "saved_address_needs_details"
    );
  });

  test("savedQuoteAddressNeedsDetails leaves a non-AU saved row alone", () => {
    assert.equal(
      savedQuoteAddressNeedsDetails(
        savedRow({ countryCode: "NZ", stateOrProvince: "Auckland", postalCode: "1010" })
      ),
      false
    );
  });

  test("the dropdown label says WHICH address needs details", () => {
    assert.ok(
      savedAddressLabel(savedRow({ stateOrProvince: "North Eastern Australia" })).endsWith(
        "— needs details"
      )
    );
    assert.ok(!savedAddressLabel(savedRow()).includes("needs details"));
  });
});

describe("mayFileQuoteAddressInBook", () => {
  test("the address book is AU only — the same reason the checkout's save tick disappears", () => {
    assert.equal(mayFileQuoteAddressInBook({ countryCode: "AU" }), true);
    assert.equal(mayFileQuoteAddressInBook({ countryCode: "" }), true, "blank means Australia");
    assert.equal(mayFileQuoteAddressInBook({ countryCode: "nz" }), false);
  });
});

describe("quoteShippingAddressSnapshot", () => {
  test("writes the quote editor's key style, not the orders one", () => {
    // Card iJfNIFn9: the quote screen, the customer's copy and the printed copy all
    // read street1/region/postcode. An orders-shaped snapshot renders a blank street.
    const snap = quoteShippingAddressSnapshot(filledAddress);
    assert.equal(snap.street1, "100 New St");
    assert.equal(snap.street2, "Unit 3");
    assert.equal(snap.region, "VIC");
    assert.equal(snap.postcode, "3134");
    assert.equal(snap.telephone, "0400 000 000");
    assert.equal(snap.country, "Australia");
    assert.equal(snap.country_code, "AU");
  });

  test("stores the NORMALISED state — this snapshot becomes the order's Ship-To", () => {
    assert.equal(quoteShippingAddressSnapshot({ ...filledAddress, state: "Victoria" }).region, "VIC");
    assert.equal(quoteShippingAddressSnapshot({ ...filledAddress, state: "vic" }).region, "VIC");
  });

  test("leaves a non-AU region exactly as typed", () => {
    const snap = quoteShippingAddressSnapshot({
      ...filledAddress,
      countryCode: "NZ",
      state: "Auckland",
    });
    assert.equal(snap.region, "Auckland");
    assert.equal(snap.country, "New Zealand");
  });

  test("stores an empty field as null, so a blank object is never read as an address", () => {
    const snap = quoteShippingAddressSnapshot({ ...filledAddress, company: "", address2: "  " });
    assert.equal(snap.company, null);
    assert.equal(snap.street2, null);
  });

  test("trims what the customer typed", () => {
    const snap = quoteShippingAddressSnapshot({ ...filledAddress, address1: "  100 New St  " });
    assert.equal(snap.street1, "100 New St");
  });
});

describe("quoteAddressBookRow", () => {
  test("files the same normalised state the quote carries, so neither is 'Needs details'", () => {
    const row = quoteAddressBookRow({ ...filledAddress, state: "Victoria" });
    assert.equal(row.stateOrProvince, "VIC");
    assert.equal(row.postalCode, "3134");
    assert.equal(row.country, "Australia");
    assert.equal(row.countryCode, "AU");
  });

  test("trims every free-text field on the way into the book", () => {
    const row = quoteAddressBookRow({
      ...filledAddress,
      firstName: " Tim ",
      company: "  Tims Chicken Shop ",
      address1: " 100 New St ",
    });
    assert.equal(row.firstName, "Tim");
    assert.equal(row.company, "Tims Chicken Shop");
    assert.equal(row.address1, "100 New St");
  });
});

describe("quoteShippingAddressFromSaved", () => {
  const saved = savedRow();

  test("carries the saved row across in the canonical key style", () => {
    const snap = quoteShippingAddressFromSaved(saved);
    assert.equal(snap.street1, "100 New St");
    assert.equal(snap.region, "VIC");
    assert.equal(snap.country, "Australia");
  });

  test("keeps the country name a legacy row stored, rather than re-deriving it", () => {
    const snap = quoteShippingAddressFromSaved({ ...saved, country: "AUSTRALIA" });
    assert.equal(snap.country, "AUSTRALIA");
  });

  test("names the country when a legacy row saved only the code", () => {
    const snap = quoteShippingAddressFromSaved({ ...saved, country: "" });
    assert.equal(snap.country, "Australia");
  });

  test("labels the dropdown the way Zoey does — who, then where", () => {
    assert.equal(savedAddressLabel(saved), "Tim Keenan, 100 New St, Ringwood, VIC, 3134, Australia");
  });

  test("a saved address with no name still labels as an address", () => {
    assert.equal(
      savedAddressLabel({ ...saved, firstName: "", lastName: "" }),
      "100 New St, Ringwood, VIC, 3134, Australia"
    );
  });
});

describe("countryNameFor", () => {
  test("names what we sell into and falls back to the code, never to nothing", () => {
    assert.equal(countryNameFor("AU"), "Australia");
    assert.equal(countryNameFor("nz"), "New Zealand");
    assert.equal(countryNameFor("US"), "US");
    assert.equal(countryNameFor(""), "Australia");
    assert.equal(countryNameFor(null), "Australia");
  });
});
