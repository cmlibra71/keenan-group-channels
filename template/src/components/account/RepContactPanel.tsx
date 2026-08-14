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
 * A line with no value is not rendered. On Chefs Depot no quote has a rep and no
 * rep has a phone number, so what a customer reads today is Customer Service,
 * cs@chefsdepot.com.au, and the storefront's general number once it is set.
 */
export function RepContactPanel({
  contact,
  heading = "Your contact",
}: {
  contact: QuoteContact;
  heading?: string;
}) {
  if (!contact.email && !contact.phone) return null;

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
        </div>
      </div>
    </div>
  );
}
