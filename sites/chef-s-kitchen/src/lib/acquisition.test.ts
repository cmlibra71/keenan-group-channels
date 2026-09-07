import { test } from "node:test";
import assert from "node:assert/strict";
import { acquisitionBagFromCookie, acquisitionBagFromRequest } from "./acquisition";

test("a visit with no campaign is not worth remembering", () => {
  assert.equal(
    acquisitionBagFromRequest(new URL("https://chefsdepot.com.au/products/x"), null),
    null
  );
  // A referrer alone is every internal click and every organic visit.
  assert.equal(
    acquisitionBagFromRequest(
      new URL("https://chefsdepot.com.au/products/x"),
      "https://www.google.com/"
    ),
    null
  );
});

test("a campaign visit keeps the marketing keys, the referrer and the landing page", () => {
  assert.deepEqual(
    acquisitionBagFromRequest(
      new URL("https://chefsdepot.com.au/categories/ovens?utm_source=google&utm_medium=cpc"),
      "https://www.google.com/"
    ),
    {
      utm_source: "google",
      utm_medium: "cpc",
      referrer: "https://www.google.com/",
      landing_path: "/categories/ovens",
    }
  );
});

test("anything that is not a marketing key is dropped before it is stored", () => {
  const bag = acquisitionBagFromRequest(
    new URL("https://chefsdepot.com.au/?utm_campaign=spring&email=buyer@example.com&token=abc"),
    null
  );
  assert.deepEqual(bag, { utm_campaign: "spring", landing_path: "/" });
});

/**
 * The cookie the PROXY actually wrote, captured from a live response on 2026-09-07:
 * the JSON is percent-encoded by us and then again by Next on the way out, and this is
 * the exact string the storefront reads back. It is here verbatim because the encoding
 * is the only part of this feature a type can not check.
 */
const LIVE_COOKIE_VALUE =
  "%257B%2522utm_source%2522%253A%2522google%2522%252C%2522utm_medium%2522%253A%2522cpc%2522%252C%2522utm_campaign%2522%253A%2522t7-test%2522%252C%2522landing_path%2522%253A%2522%252F%2522%257D";

test("the cookie the proxy writes is the cookie the quote reads", () => {
  assert.deepEqual(acquisitionBagFromCookie(LIVE_COOKIE_VALUE), {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "t7-test",
    landing_path: "/",
  });
  // Once-decoded (what a reader that decodes for you hands over) reads the same.
  assert.deepEqual(
    acquisitionBagFromCookie(decodeURIComponent(LIVE_COOKIE_VALUE)),
    acquisitionBagFromCookie(LIVE_COOKIE_VALUE)
  );
});

test("an unreadable or tampered cookie costs nobody their quote", () => {
  assert.equal(acquisitionBagFromCookie(undefined), null);
  assert.equal(acquisitionBagFromCookie(""), null);
  assert.equal(acquisitionBagFromCookie("not json"), null);
  assert.equal(acquisitionBagFromCookie("%E0%A4%A"), null);
  assert.equal(acquisitionBagFromCookie('{"utm_source":""}'), null);
});
