import Link from "next/link";
import { Package, FileText, MapPin, LogOut, Crown, Trophy, Gift, ArrowRight, Calendar, Ticket, KeyRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { formatMemberSince } from "@/lib/member-date";
import { contactService, getFeatureFlag, getActiveSubscriptionForContact,
  getMemberSince, getUpcomingDraws, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeNextPath, signInPrompt } from "@/lib/account-redirect";
import { normaliseEmail, looksLikeEmail } from "@/lib/checkout/account-prompt";
import { logout } from "@/lib/actions/auth";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = {
  title: "Account",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const session = await getSession();

  if (!session) {
    // Set by the `/account/**` guards — e.g. the "View your orders" button on an
    // order confirmation, opened in a browser with no session. Signing in returns
    // the customer to it instead of dropping them on this panel.
    const params = await searchParams;
    const next = safeNextPath(params.next);
    // Carried by the register form's "Sign in" offer when the address already has
    // an account — echoed back only if it still looks like one.
    const typedEmail = normaliseEmail(params.email);
    const prefillEmail = looksLikeEmail(typedEmail) ? typedEmail : null;
    return (
      <AccountShell>
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Account</h1>
        {next && <p className="text-zinc-600 mb-4">{signInPrompt(next)}</p>}
        <LoginForm next={next} defaultEmail={prefillEmail} />
      </AccountShell>
    );
  }

  const [customer, subscriptionsEnabled, drawsEnabled, partnerOffersEnabled] =
    await Promise.all([
      contactService.getById(session.contactId) as Promise<{
        first_name: string;
        last_name: string;
        email: string;
      } | null>,
      getFeatureFlag("subscriptions_enabled"),
      getFeatureFlag("draws_enabled"),
      getFeatureFlag("partner_offers_enabled"),
    ]);

  const activeSub = subscriptionsEnabled
    ? await getActiveSubscriptionForContact(session.contactId)
    : null;

  // The date they joined, shown on the member card (card pgRmsaTX). Only asked for
  // when there IS a membership, so a non-member's page costs nothing extra.
  const memberSince = activeSub ? await getMemberSince(session.contactId) : null;
  // Melbourne, always — the container runs UTC and a UTC-evening sign-up
  // would otherwise tell the member they joined the day before (member-date.ts).
  const memberSinceLabel = formatMemberSince(memberSince);

  // Fetch draw info for members
  let totalEntries = 0;
  let nextDrawDate: Date | null = null;
  if (activeSub && drawsEnabled) {
    type DrawEntry = {
      entry: { id: number; entryCount: number | null; status: string };
    };
    const [entries, upcomingDraws] = await Promise.all([
      drawEntryService.getEntriesForContact(session.contactId, CHANNEL_ID) as Promise<DrawEntry[]>,
      getUpcomingDraws(),
    ]);
    totalEntries = entries
      .filter((e) => e.entry.status === "active")
      .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
    if (upcomingDraws.length > 0 && upcomingDraws[0].scheduled_at) {
      nextDrawDate = new Date(upcomingDraws[0].scheduled_at);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-zinc-900">My Account</h1>
          {activeSub && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              <Crown className="h-3 w-3" />
              Member
            </span>
          )}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>

      {/* Member Dashboard Card */}
      {activeSub ? (
        <div className="rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-zinc-400 text-sm">Welcome back</p>
              <p className="text-lg font-semibold">
                {customer?.first_name} {customer?.last_name}
              </p>
              <p className="text-sm text-zinc-400">{customer?.email}</p>
              {memberSinceLabel && (
                <p className="text-sm text-zinc-400">
                  Member since{" "}
                  {memberSinceLabel}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              {activeSub.consecutive_months != null && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{activeSub.consecutive_months}</p>
                  <p className="text-xs text-zinc-400">months</p>
                </div>
              )}
              {drawsEnabled && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{totalEntries}</p>
                  <p className="text-xs text-zinc-400">draw entries</p>
                </div>
              )}
              {nextDrawDate && (
                <div className="text-center">
                  <p className="text-xs text-zinc-400">Next draw</p>
                  <p className="text-sm font-medium text-white">
                    {nextDrawDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">Welcome back</h2>
          <p className="text-zinc-600">
            {customer?.first_name} {customer?.last_name}
          </p>
          <p className="text-sm text-zinc-500">{customer?.email}</p>
        </div>
      )}

      {/* Non-member upsell */}
      {subscriptionsEnabled && !activeSub && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown className="h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-zinc-900">Become a Member</h3>
              </div>
              <p className="text-sm text-zinc-600">
                Unlock exclusive pricing, prize draws, and partner discounts.
              </p>
            </div>
            <Link
              href="/membership"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 text-zinc-900 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 transition-colors shrink-0"
            >
              Learn More
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Account Grid — reordered for members */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Members see draws first */}
        {drawsEnabled && activeSub && (
          <Link
            href="/account/draws"
            className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-zinc-900">My Draws</h3>
              <p className="text-sm text-zinc-500">{totalEntries} active entries</p>
            </div>
          </Link>
        )}
        {subscriptionsEnabled && (
          <Link
            href="/account/membership"
            className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
          >
            <Crown className="h-8 w-8 text-amber-500" />
            <div>
              <h3 className="font-semibold text-zinc-900">Membership</h3>
              <p className="text-sm text-zinc-500">
                {activeSub ? "Manage your plan" : "Join & save"}
              </p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-zinc-900">Partner Offers</h3>
              <p className="text-sm text-zinc-500">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/account/profile"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <MapPin className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Account Details</h3>
            <p className="text-sm text-zinc-500">Profile, addresses &amp; contacts</p>
          </div>
        </Link>
        <Link
          href="/account/security"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <KeyRound className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Password &amp; Security</h3>
            <p className="text-sm text-zinc-500">Change your password</p>
          </div>
        </Link>
        <Link
          href="/account/orders"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <Package className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Order History</h3>
            <p className="text-sm text-zinc-500">View your past orders</p>
          </div>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <FileText className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">My Quotes</h3>
            <p className="text-sm text-zinc-500">View and track your quotes</p>
          </div>
        </Link>
        {/* Non-member draws and partner offers */}
        {drawsEnabled && !activeSub && (
          <Link
            href="/account/draws"
            className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-zinc-900">My Draws</h3>
              <p className="text-sm text-zinc-500">Entries & prizes</p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && !activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-zinc-900">Partner Offers</h3>
              <p className="text-sm text-zinc-500">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/products"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <MapPin className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Continue Shopping</h3>
            <p className="text-sm text-zinc-500">Browse our products</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
