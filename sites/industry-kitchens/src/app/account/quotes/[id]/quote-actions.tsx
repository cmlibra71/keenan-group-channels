"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptQuote, duplicateQuote, requestMoreTime, requestQuoteChange } from "@/lib/actions/quote";
import type { QuoteAcceptState } from "@/lib/quotes/price-visibility";
import type { CustomerRequestState } from "@keenan/services";

export function QuoteActions({
  quoteId,
  status,
  acceptState,
  requestState,
}: {
  quoteId: number;
  status: string;
  /** Resolved server-side (same rule the accept action enforces). */
  acceptState: QuoteAcceptState;
  /** Which of the "ask us something" controls this quote offers — same rule the
   *  actions enforce, so a button can never promise what the server refuses. */
  requestState: CustomerRequestState;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canDuplicate = !["quote_cancelled"].includes(status);

  const run = (
    fn: () => Promise<{
      success?: boolean;
      error?: string;
      quoteId?: number;
      /** Set by acceptQuote: the portal's acceptance acknowledgement page. */
      acknowledgementUrl?: string | null;
    }>,
    okText: string,
    goTo?: (r: { quoteId?: number }) => string,
  ) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r?.error) {
        setMsg({ kind: "err", text: r.error });
      } else {
        setMsg({ kind: "ok", text: okText });
        // Card 87IkgD2H (Tim, 2026-08-19): accepting takes the customer to a real
        // acknowledgement — what happens next, how to pay, the finance offer and a
        // ten-second countdown back to this account area — rather than refreshing
        // this page under them. It is the PORTAL's page, so this is a full
        // navigation, not a router push. A quote that somehow carries no
        // acknowledgement URL falls through to the refresh this always did.
        if (r?.acknowledgementUrl) {
          window.location.assign(r.acknowledgementUrl);
          return;
        }
        if (goTo && r?.quoteId) router.push(goTo(r));
        else router.refresh();
      }
    });

  const showsAnyRequest = requestState.canRequestMoreTime || requestState.canRequestChange;
  if (acceptState.kind === "hidden" && !canDuplicate && !showsAnyRequest) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6">
      {acceptState.kind === "enabled" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => acceptQuote(quoteId),
              // Accepting without paying sends the pro-forma (card 0Wy0xHuq) —
              // say so, or the customer waits for something they think is coming.
              "Quote accepted — we've emailed your pro-forma. You can pay it below."
            )
          }
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working…" : "Accept quote"}
        </button>
      )}
      {/* Not acceptable yet: the button stays on screen, greyed and inert, carrying
          the reason on hover — rather than vanishing and leaving the customer
          hunting for it. Mirrors the portal's gated-button treatment: aria-disabled
          + pointer-events-none (so hover still reaches the wrapper and fires the
          tooltip) rather than the native `disabled` attribute. */}
      {acceptState.kind === "disabled" && (
        <span
          className="group relative inline-flex cursor-not-allowed"
          title={acceptState.reason}
        >
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            className="pointer-events-none rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Accept quote
          </button>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 block w-max max-w-xs -translate-x-1/2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
          >
            {acceptState.reason}
          </span>
        </span>
      )}
      {canDuplicate && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => duplicateQuote(quoteId), "Duplicated", (r) => `/account/quotes/${r.quoteId}`)
          }
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          Duplicate
        </button>
      )}
      {requestState.canRequestMoreTime && (
        <RequestButton
          quoteId={quoteId}
          kind="more_time"
          label="Request more time"
          heading="Ask for more time on this quote"
          placeholder="Optional — when would suit you?"
          requireNote={false}
          done="We've asked your contact for more time. They'll be in touch."
        />
      )}
      {requestState.canRequestChange && (
        <RequestButton
          quoteId={quoteId}
          kind="change"
          label="Request a change"
          heading="Ask for a change to this quote"
          placeholder="Tell us what needs to change — delivery address, freight, anything else."
          requireNote
          done="We've sent your request. Your contact will come back to you."
        />
      )}
      {msg && (
        <span className={`text-sm ${msg.kind === "ok" ? "text-zinc-500" : "text-red-600"}`}>{msg.text}</span>
      )}
    </div>
  );
}

/**
 * "Request more time" / "Request a change" — the two things a customer can ASK
 * FOR on a quote they cannot change themselves (card DIj4B7Gr).
 *
 * A short note box opens inline rather than in a modal, matching the inline
 * confirm idiom already used on this page. Neither request changes the quote's
 * expiry date: extension is a decision a rep makes by hand (Tim, 2026-08-07).
 */
function RequestButton({
  quoteId,
  kind,
  label,
  heading,
  placeholder,
  requireNote,
  done,
}: {
  quoteId: number;
  kind: "more_time" | "change";
  label: string;
  heading: string;
  placeholder: string;
  requireNote: boolean;
  done: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  if (sent) return <span className="text-sm text-zinc-500">{done}</span>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        {label}
      </button>
    );
  }

  const blocked = requireNote && note.trim().length === 0;

  return (
    <div className="w-full space-y-2 rounded-md border border-zinc-200 p-3">
      <p className="text-sm font-medium text-zinc-900">{heading}</p>
      <textarea
        rows={3}
        maxLength={1000}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || blocked}
          onClick={() =>
            start(async () => {
              setError(null);
              const r =
                kind === "more_time"
                  ? await requestMoreTime(quoteId, note.trim() || undefined)
                  : await requestQuoteChange(quoteId, note.trim());
              if ("error" in r) {
                setError(r.error);
                return;
              }
              setSent(true);
              setOpen(false);
              router.refresh();
            })
          }
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
        >
          Cancel
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
