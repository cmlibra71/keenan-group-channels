import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { quoteService, CHANNEL_ID } from "@/lib/store";
import { loadQuoteContactForQuote, resolveQuoteContact } from "@keenan/services";
import { AccountShell } from "@/components/account/AccountShell";
import { RepContactPanel } from "@/components/account/RepContactPanel";
import { isStaffOnlyDraft } from "@/lib/quotes/draft-visibility";

export const metadata = {
  title: "Contact your rep",
};

/**
 * "Contact your rep" — who to talk to about this customer's quotes.
 *
 * Resolved from the customer's MOST RECENT quote through the same helper the
 * quote page uses, so the menu page and the quote can never name different
 * people. With no quote at all (or no rep on it) it falls back to the
 * storefront's customer-service desk, which is the normal answer on Chefs Depot.
 */
export default async function AccountContactPage() {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/contact"));

  const result = await quoteService.list({
    page: 1,
    limit: 5,
    sort: "created_at",
    direction: "desc",
    filters: {
      contact_id: { type: "eq", value: session.contactId },
      channel_id: { type: "eq", value: CHANNEL_ID },
    },
  });
  const latest = (result.data as unknown as Array<{ id: number; status?: string | null }>).find(
    (q) => !isStaffOnlyDraft(q)
  );

  // No quote yet: the customer-service desk, resolved by the same rule with
  // nothing to match on. `loadQuoteContactForQuote` needs a quote; this branch
  // gets the same answer without inventing one.
  const contact = latest
    ? await loadQuoteContactForQuote(latest.id)
    : await loadChannelDeskContact();

  return (
    <AccountShell>
      <p className="eyebrow mb-3">CONTACT</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-2">Contact your rep</h1>
      <p className="mb-8 text-sm text-text-muted">
        {contact.isFallback
          ? "Our customer service team looks after your quotes and orders."
          : "This is the person looking after your quotes."}
      </p>
      <RepContactPanel contact={contact} heading="Who to talk to" />
    </AccountShell>
  );
}

/** The desk, when the customer has no quote for a rep to be resolved from. */
async function loadChannelDeskContact() {
  const { readQuoteChannelConfig, resolveEmailBranding } = await import("@keenan/services");
  const [config, branding] = await Promise.all([
    readQuoteChannelConfig(CHANNEL_ID).catch(() => null),
    resolveEmailBranding(CHANNEL_ID).catch(() => undefined),
  ]);
  return resolveQuoteContact({
    csEmail: config?.csEmail ?? null,
    csPhone: config?.csPhone ?? null,
    siteUrl: branding?.siteUrl ?? null,
  });
}
