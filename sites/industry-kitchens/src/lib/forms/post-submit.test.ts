import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostSubmit } from "./post-submit";

test("a form with neither setting keeps today's behaviour", () => {
  assert.deepEqual(resolvePostSubmit({}), {});
  assert.deepEqual(resolvePostSubmit({ confirmation_message: null, redirect_url: null }), {});
  assert.deepEqual(resolvePostSubmit({ confirmation_message: "   " }), {});
});

test("an authored message is handed back verbatim, newlines and all", () => {
  const message = "Thanks!\n\nWe reply within one business day.";
  assert.deepEqual(resolvePostSubmit({ confirmation_message: message }), { message });
});

test("a destination is returned site-relative", () => {
  assert.deepEqual(resolvePostSubmit({ redirect_url: "/pages/thank-you" }), {
    redirectTo: "/pages/thank-you",
  });
});

test("a destination that would leave the site is DROPPED, and the message still shows", () => {
  // The portal normalises on the way in; this is the last check before a browser
  // acts on it, so it refuses rather than assumes.
  assert.deepEqual(
    resolvePostSubmit({ confirmation_message: "Thanks!", redirect_url: "https://evil.com/x" }),
    { message: "Thanks!" }
  );
  assert.deepEqual(resolvePostSubmit({ redirect_url: "javascript:alert(1)" }), {});
  // A backslash reads as a slash to a browser: it must not survive as an origin.
  assert.deepEqual(resolvePostSubmit({ redirect_url: "/\\evil.com" }), { redirectTo: "/evil.com" });
  assert.deepEqual(resolvePostSubmit({ redirect_url: "//evil.com/x" }), { redirectTo: "/evil.com/x" });
});

test("both may be set — the destination wins at the call site, both are carried", () => {
  assert.deepEqual(
    resolvePostSubmit({ confirmation_message: "Thanks!", redirect_url: "/pages/thanks" }),
    { message: "Thanks!", redirectTo: "/pages/thanks" }
  );
});

test("a non-string value is ignored rather than stringified", () => {
  assert.deepEqual(resolvePostSubmit({ confirmation_message: 42, redirect_url: {} }), {});
});
