"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postQuoteMessage } from "@/lib/actions/quote";

export interface QuoteThreadMessage {
  id: number | string;
  author_name: string | null;
  author_type: string | null;
  body: string | null;
  created_at: string | Date | null;
}

function formatDate(value: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU");
}

/**
 * The quote's message thread, with a compose box (card DIj4B7Gr).
 *
 * Both sides read the same `quote_comments` rows — the rep in the portal, the
 * customer here — so a reply is never lost in somebody's inbox. Rendered even
 * when the thread is empty: a message box a customer cannot see is one they
 * never use.
 */
export function QuoteMessages({
  quoteId,
  messages,
  canSend,
}: {
  quoteId: number;
  messages: QuoteThreadMessage[];
  canSend: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Messages</h2>
      {messages.length > 0 ? (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={String(m.id)} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary">
                  {m.author_name || (m.author_type === "customer" ? "You" : "Your supplier")}
                </span>
                <span className="text-xs text-text-muted">{formatDate(m.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-text-secondary">{m.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">
          No messages yet. Anything you write here goes straight to the person looking after this
          quote.
        </p>
      )}

      {canSend && (
        <div className="mt-4 space-y-2">
          <label htmlFor="quote-message" className="sr-only">
            Write a message
          </label>
          <textarea
            id="quote-message"
            rows={3}
            maxLength={2000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setError(null);
            }}
            placeholder="Write a message about this quote…"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-text-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm ${error ? "text-red-600" : "text-text-muted"}`}>
              {error ?? "Your message is emailed to the person looking after this quote."}
            </span>
            <button
              type="button"
              disabled={pending || body.trim().length === 0}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await postQuoteMessage(quoteId, body.trim());
                  if ("error" in r) {
                    setError(r.error);
                    return;
                  }
                  setBody("");
                  router.refresh();
                })
              }
              className="shrink-0 rounded-md bg-text-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
