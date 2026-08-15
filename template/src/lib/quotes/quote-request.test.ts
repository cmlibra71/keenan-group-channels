import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_QUOTE_REQUEST_ADDRESS,
  QUOTE_NAME_MAX_LENGTH,
  countryNameFor,
  quoteShippingAddressFromSaved,
  quoteShippingAddressSnapshot,
  savedAddressLabel,
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

const form = (over: Partial<QuoteRequestForm> = {}): QuoteRequestForm => ({
  quoteName: "New kitchen fit-out",
  comments: "",
  addressId: 7,
  newAddress: EMPTY_QUOTE_REQUEST_ADDRESS,
  ...over,
});

describe("validateQuoteRequest — the quote name", () => {
  test("is compulsory (Steve, 2026-07-26: 'It should be compulsory')", () => {
    assert.equal(validateQuoteRequest(form({ quoteName: "" }), [7]), "quote_name_required");
  });

  test("counts whitespace as nothing", () => {
    assert.equal(validateQuoteRequest(form({ quoteName: "   " }), [7]), "quote_name_required");
  });

  test("is refused politely past the column's own limit rather than by Postgres", () => {
    assert.equal(
      validateQuoteRequest(form({ quoteName: "x".repeat(QUOTE_NAME_MAX_LENGTH + 1) }), [7]),
      "quote_name_too_long"
    );
    assert.equal(
      validateQuoteRequest(form({ quoteName: "x".repeat(QUOTE_NAME_MAX_LENGTH) }), [7]),
      null
    );
  });
});

describe("validateQuoteRequest — the delivery address", () => {
  test("a saved address the customer really has is accepted", () => {
    assert.equal(validateQuoteRequest(form({ addressId: 7 }), [3, 7]), null);
  });

  test("an id the customer does NOT have reads as no address, never as trusted", () => {
    // The whole point: a tampered or stale form must not attach a stranger's address.
    assert.equal(validateQuoteRequest(form({ addressId: 999 }), [3, 7]), "address_required");
  });

  test("a customer with no saved addresses must type one", () => {
    assert.equal(validateQuoteRequest(form({ addressId: 7 }), []), "address_required");
  });

  test("a typed address needs a street, a suburb, a state and a postcode", () => {
    const typed = (over: Partial<typeof filledAddress>) =>
      validateQuoteRequest(
        form({ addressId: "new", newAddress: { ...filledAddress, ...over } }),
        []
      );
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

describe("quoteShippingAddressFromSaved", () => {
  const saved: SavedQuoteAddress = {
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
  };

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
