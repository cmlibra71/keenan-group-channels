import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  QUOTE_REQUEST_NOTES_KEY,
  forgetQuoteRequestNotes,
  keepQuoteRequestNotes,
  parseQuoteRequestNotes,
  readKeptQuoteRequestNotes,
  serialiseQuoteRequestNotes,
} from "./quote-request-notes";

/**
 * What this guards: the quote-request drawer used to reset the Quote Name and the
 * Quote Comments every time it opened, so a shopper who pressed "Continue Shopping"
 * to add one more product lost both (card mSVeTQol, Tim 2026-09-18). The values are
 * now kept against the quote's uuid.
 *
 * The two things that must not break are in here. First, the uuid stamp: submitting
 * a request LOCKS it and starts a fresh quote (card 9tbz3sBF), so a kept entry must
 * never re-appear in the NEXT quote — a mismatched uuid reads as nothing kept even
 * if the clear on submit never ran. Second, storage is optional: a browser that
 * throws on read or write still has to be able to send a quote request, it just
 * opens with empty boxes the way it did before this card.
 */

type FakeStore = Storage & { map: Map<string, string> };

/** The smallest thing that behaves like `localStorage` for these four calls. */
function fakeStore(onWrite?: () => void, onRead?: () => void): FakeStore {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key: string) {
      onRead?.();
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      onWrite?.();
      map.set(key, value);
    },
    removeItem(key: string) {
      onWrite?.();
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key() {
      return null;
    },
    get length() {
      return map.size;
    },
  } as FakeStore;
}

function withStore(store: Storage | null) {
  (globalThis as { window?: unknown }).window = store ? { localStorage: store } : undefined;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("serialiseQuoteRequestNotes", () => {
  test("keeps what was typed, stamped with the quote it belongs to", () => {
    const body = serialiseQuoteRequestNotes("uuid-1", {
      quoteName: "Kitchen fit-out — Smith St",
      comments: "Needs delivery before the 12th",
    });
    assert.deepEqual(JSON.parse(body as string), {
      uuid: "uuid-1",
      quoteName: "Kitchen fit-out — Smith St",
      comments: "Needs delivery before the 12th",
    });
  });

  test("keeps a comment on its own — only the NAME is compulsory to send", () => {
    const body = serialiseQuoteRequestNotes("uuid-1", { quoteName: "", comments: "Call me" });
    assert.equal(JSON.parse(body as string).comments, "Call me");
  });

  test("stores nothing when there is no quote yet", () => {
    assert.equal(serialiseQuoteRequestNotes(null, { quoteName: "Anything", comments: "" }), null);
  });

  test("stores nothing for empty or whitespace-only boxes", () => {
    assert.equal(serialiseQuoteRequestNotes("uuid-1", { quoteName: "", comments: "" }), null);
    assert.equal(serialiseQuoteRequestNotes("uuid-1", { quoteName: "  ", comments: "\n" }), null);
  });

  test("does not trim what it keeps — the shopper's spacing is their own", () => {
    const body = serialiseQuoteRequestNotes("uuid-1", { quoteName: " Bar fit-out ", comments: "" });
    assert.equal(JSON.parse(body as string).quoteName, " Bar fit-out ");
  });
});

describe("parseQuoteRequestNotes", () => {
  test("reads back what was stored for the same quote", () => {
    const raw = serialiseQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "ASAP" });
    assert.deepEqual(parseQuoteRequestNotes(raw, "uuid-1"), {
      quoteName: "Fit-out",
      comments: "ASAP",
    });
  });

  test("IGNORES an entry left by a different quote", () => {
    const raw = serialiseQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "ASAP" });
    assert.equal(parseQuoteRequestNotes(raw, "uuid-2"), null);
  });

  test("ignores everything unreadable rather than throwing", () => {
    assert.equal(parseQuoteRequestNotes(null, "uuid-1"), null);
    assert.equal(parseQuoteRequestNotes("", "uuid-1"), null);
    assert.equal(parseQuoteRequestNotes("not json", "uuid-1"), null);
    assert.equal(parseQuoteRequestNotes("null", "uuid-1"), null);
    assert.equal(parseQuoteRequestNotes('"a string"', "uuid-1"), null);
    assert.equal(parseQuoteRequestNotes('{"uuid":"uuid-1"}', "uuid-1"), null);
    assert.equal(
      parseQuoteRequestNotes('{"uuid":"uuid-1","quoteName":7,"comments":null}', "uuid-1"),
      null
    );
  });

  test("takes the half it can read when the other half is not a string", () => {
    assert.deepEqual(
      parseQuoteRequestNotes('{"uuid":"uuid-1","quoteName":"Fit-out","comments":7}', "uuid-1"),
      { quoteName: "Fit-out", comments: "" }
    );
  });

  test("reads nothing when there is no quote to match against", () => {
    const raw = serialiseQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "" });
    assert.equal(parseQuoteRequestNotes(raw, null), null);
  });
});

describe("the browser wrappers", () => {
  test("keep, read back, and forget on one quote", () => {
    const store = fakeStore();
    withStore(store);
    keepQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "ASAP" });
    assert.deepEqual(readKeptQuoteRequestNotes("uuid-1"), {
      quoteName: "Fit-out",
      comments: "ASAP",
    });
    forgetQuoteRequestNotes();
    assert.equal(readKeptQuoteRequestNotes("uuid-1"), null);
    assert.equal(store.map.size, 0);
  });

  test("a fresh quote after submission reads nothing, even if the clear never ran", () => {
    const store = fakeStore();
    withStore(store);
    keepQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "ASAP" });
    assert.equal(readKeptQuoteRequestNotes("uuid-2"), null);
  });

  test("emptying both boxes removes the entry rather than keeping a blank one", () => {
    const store = fakeStore();
    withStore(store);
    keepQuoteRequestNotes("uuid-1", { quoteName: "Fit-out", comments: "" });
    assert.equal(store.map.size, 1);
    keepQuoteRequestNotes("uuid-1", { quoteName: "", comments: "" });
    assert.equal(store.map.has(QUOTE_REQUEST_NOTES_KEY), false);
  });

  test("only ever holds one entry, so a long session cannot pile them up", () => {
    const store = fakeStore();
    withStore(store);
    keepQuoteRequestNotes("uuid-1", { quoteName: "One", comments: "" });
    keepQuoteRequestNotes("uuid-2", { quoteName: "Two", comments: "" });
    assert.equal(store.map.size, 1);
    assert.deepEqual(readKeptQuoteRequestNotes("uuid-2"), { quoteName: "Two", comments: "" });
  });

  test("a browser that throws on write still lets the shopper get on with it", () => {
    const store = fakeStore(() => {
      throw new Error("site data blocked");
    });
    withStore(store);
    assert.doesNotThrow(() => keepQuoteRequestNotes("uuid-1", { quoteName: "A", comments: "" }));
    assert.doesNotThrow(() => forgetQuoteRequestNotes());
    assert.equal(readKeptQuoteRequestNotes("uuid-1"), null);
  });

  test("a browser that throws on read behaves as nothing kept", () => {
    const store = fakeStore(undefined, () => {
      throw new Error("site data blocked");
    });
    withStore(store);
    assert.equal(readKeptQuoteRequestNotes("uuid-1"), null);
  });

  test("no window at all (server render) is not an error", () => {
    withStore(null);
    assert.equal(readKeptQuoteRequestNotes("uuid-1"), null);
    assert.doesNotThrow(() => keepQuoteRequestNotes("uuid-1", { quoteName: "A", comments: "" }));
    assert.doesNotThrow(() => forgetQuoteRequestNotes());
  });
});
