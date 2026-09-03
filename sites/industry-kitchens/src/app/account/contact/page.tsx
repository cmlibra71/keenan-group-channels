import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { quoteService, CHANNEL_ID } from "@/lib/store";
import { loadContactChannelContact, loadQuoteContactForQuote } from "@keenan/services";
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
 * people. With NO QUOTE AT ALL there is nothing to resolve from, so the customer's
 * own ACCOUNT is asked who looks after them (card 6mAn2B9O) — the same three-arm
 * rule, the same storefront gate, through the same loader. Only where neither a
 * quote nor an account names anybody does it fall back to the
 * storefront's customer-service desk, which is the normal answer when no rep is assigned.
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

  // No quote yet: ask the customer's ACCOUNT who looks after them, and fall to
  // this storefront's desk only if it names nobody either (card 6mAn2B9O). A
  // customer whose account has had a rep for years used to meet the desk here
  // purely because they had not been quoted yet.
  const contact = latest
    ? await loadQuoteContactForQuote(latest.id)
    : await loadContactChannelContact(session.contactId, CHANNEL_ID);

  return (
    <AccountShell>
      <h1 className="text-3xl font-bold text-zinc-900 mb-2">Contact your rep</h1>
      <p className="mb-8 text-sm text-zinc-500">
        {contact.isFallback
          ? "Our customer service team looks after your quotes and orders."
          : "This is the person looking after your quotes."}
      </p>
      <RepContactPanel contact={contact} heading="Who to talk to" />
    </AccountShell>
  );
}
