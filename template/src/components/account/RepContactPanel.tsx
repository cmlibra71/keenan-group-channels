import { Mail, Phone, UserRound } from "lucide-react";
import type { QuoteContact } from "@keenan/services";

/**
 * "Who is looking after this" — the rep's name, email and phone, or the
 * storefront's customer-service desk when no rep owns the quote (card DIj4B7Gr).
 *
 * The values are resolved ONCE, in `@keenan/services`, by the same rule the
 * portal's emailed quote view and the change-request email use — so the account
 * page, the emailed link and the rep's own inbox can never disagree about who
 * owns a customer's quote.
 *
 * A named rep who holds no mobile of their own gets this storefront's own
 * customer-service number underneath, labelled as the desk (card 6mAn2B9O, Tim
 * 2026-08-16: "All our reps have a mobile number - Or if no rep - Use 1800
 * number"). It is never printed as the rep's own line, and never hardcoded here:
 * it is read from the record's OWN channel, so a Chefs Depot page can never show
 * Industry Kitchens' number.
 *
 * A line with no value is not rendered. No active rep holds a mobile, so the
 * number under a named rep is the storefront's own, labelled as the desk.
 *
 * WHAT A CHEFS DEPOT CUSTOMER READS, re-measured 2026-09-04. Still Customer
 * Service, cs@chefsdepot.com.au and 1800 671 143 on everything the desk owns —
 * but that is no longer because CD records carry no rep. Card QRA0m4vh's ladder
 * now stamps CD's cs@ rep row (2215) on an order raised by a website payment
 * that nobody else owns, and that row is NAMED "Fiona Robinson". It reads as the
 * desk here because `resolveQuoteContact` tests the rep's ADDRESS against the
 * storefront's own cs@ mailbox, not their name — a customer handed a shared
 * mailbox is talking to the desk, and naming one person promises them somebody
 * who may not answer. A rep who is genuinely their own (a quote's Sales Agent
 * pick, an account assignment) is still named in full.
 */
export function RepContactPanel({
  contact,
  heading = "Your contact",
}: {
  contact: QuoteContact;
  heading?: string;
}) {
  if (!contact.email && !contact.phone && !contact.deskPhone) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {heading}
      </h2>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-text-secondary">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-primary">{contact.name}</p>
          {contact.email && (
            <p className="flex items-center gap-1.5 text-sm">
              <Mail className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <a href={`mailto:${contact.email}`} className="break-all text-accent hover:underline">
                {contact.email}
              </a>
            </p>
          )}
          {contact.phone && (
            <p className="flex items-center gap-1.5 text-sm">
              <Phone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <a
                href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
                className="text-accent hover:underline"
              >
                {contact.phone}
              </a>
            </p>
          )}
          {!contact.phone && contact.deskPhone && (
            <p className="flex items-start gap-1.5 text-sm">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span>
                <a
                  href={`tel:${contact.deskPhone.replace(/[^\d+]/g, "")}`}
                  className="whitespace-nowrap text-accent hover:underline"
                >
                  {contact.deskPhone}
                </a>
                <span className="block text-xs text-text-muted">Customer service</span>
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
