/**
 * The Quote Name and Quote Comments a shopper has typed into the quote-request
 * drawer, KEPT while they carry on shopping (card mSVeTQol, Tim 2026-09-18).
 *
 * The drawer asks for three things before a request can be sent (card 9tbz3sBF):
 * a compulsory Quote Name, free-text Quote Comments and a delivery address. The
 * panel holds the first two in component state and resets them every time it
 * opens, so a shopper who typed a name, hit "Continue Shopping" to add one more
 * product, and came back found both boxes empty — the report this card is about.
 * Typing a fit-out name and a paragraph of requirements twice is the kind of thing
 * that loses the request altogether.
 *
 * So the two typed values are remembered against the quote they belong to, and
 * only that quote: the entry carries the quote's uuid and is ignored the moment the
 * uuid changes. That is what makes submission safe — submitting clears the quote
 * cookie and starts a FRESH quote (the request locks on send, card 9tbz3sBF, Steve:
 * "They need to phone or email for that"), so even if the clear below never ran,
 * the new quote's uuid could not match and yesterday's words could not be
 * resurrected into it.
 *
 * Nothing here is a rule about the REQUEST — the compulsory name, the comments
 * landing in `quotes.customer_notes` and the required delivery address are all
 * decided in `quote-request.ts` and applied on the server. This module only decides
 * what the browser remembers between two openings of the same drawer.
 *
 * The parse/serialise halves are pure so they can be tested without a DOM; the
 * three wrappers touch `localStorage` and every one of them is wrapped in
 * try/catch. A browser with site data blocked (Safari private browsing throws on
 * write, some managed browsers throw on read) must still be able to send a quote
 * request: it simply behaves the way it did before this card, with the boxes empty
 * on reopen.
 */

/** One key, uuid-stamped inside, so a new quote cannot accumulate a second entry. */
export const QUOTE_REQUEST_NOTES_KEY = "kg.quote-request-notes";

/** The two typed values the drawer keeps. */
export type QuoteRequestNotes = {
  quoteName: string;
  comments: string;
};

type StoredQuoteRequestNotes = QuoteRequestNotes & { uuid: string };

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * What to store for this quote, or `null` when there is nothing worth keeping —
 * no quote yet, or both boxes empty, in which case the caller removes the entry
 * rather than leaving an empty one behind.
 */
export function serialiseQuoteRequestNotes(
  uuid: string | null | undefined,
  notes: QuoteRequestNotes
): string | null {
  if (!uuid) return null;
  if (!hasText(notes.quoteName) && !hasText(notes.comments)) return null;
  const body: StoredQuoteRequestNotes = {
    uuid,
    quoteName: notes.quoteName,
    comments: notes.comments,
  };
  return JSON.stringify(body);
}

/**
 * What a stored string means for the quote in front of us. Anything that is not an
 * object carrying THIS quote's uuid and two strings is treated as nothing kept:
 * a stale entry from a previous quote, a half-written value, or a key a future
 * version of this code wrote differently.
 */
export function parseQuoteRequestNotes(
  raw: string | null | undefined,
  uuid: string | null | undefined
): QuoteRequestNotes | null {
  if (!raw || !uuid) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  if (row.uuid !== uuid) return null;
  const quoteName = typeof row.quoteName === "string" ? row.quoteName : "";
  const comments = typeof row.comments === "string" ? row.comments : "";
  if (!hasText(quoteName) && !hasText(comments)) return null;
  return { quoteName, comments };
}

/** `localStorage`, or null wherever it cannot be reached (SSR, blocked site data). */
function notesStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What this shopper typed last time the drawer was open, for THIS quote only. */
export function readKeptQuoteRequestNotes(uuid: string | null | undefined): QuoteRequestNotes | null {
  const store = notesStore();
  if (!store || !uuid) return null;
  try {
    return parseQuoteRequestNotes(store.getItem(QUOTE_REQUEST_NOTES_KEY), uuid);
  } catch {
    return null;
  }
}

/** Remember the typed values against this quote. Silent where storage refuses. */
export function keepQuoteRequestNotes(
  uuid: string | null | undefined,
  notes: QuoteRequestNotes
): void {
  const store = notesStore();
  if (!store) return;
  try {
    const body = serialiseQuoteRequestNotes(uuid, notes);
    if (body === null) store.removeItem(QUOTE_REQUEST_NOTES_KEY);
    else store.setItem(QUOTE_REQUEST_NOTES_KEY, body);
  } catch {
    // Quota, blocked site data, a browser that throws on write in private mode:
    // the request itself must not depend on this working.
  }
}

/** Forget them — the request has been sent, or the quote is empty. */
export function forgetQuoteRequestNotes(): void {
  const store = notesStore();
  if (!store) return;
  try {
    store.removeItem(QUOTE_REQUEST_NOTES_KEY);
  } catch {
    // Same reasoning as keepQuoteRequestNotes.
  }
}
