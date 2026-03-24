import Link from "next/link";
import { Package, FileText, MapPin, LogOut, Crown, Trophy, Gift, ArrowRight, Calendar, Ticket } from "lucide-react";
import { getSession } from "@/lib/auth";
import { customerService, getFeatureFlag, getActiveSubscription, getUpcomingDraws, drawEntryService, CHANNEL_ID } from "@/lib/store";
import { LoginForm } from "@/components/auth/LoginForm";
import { logout } from "@/lib/actions/auth";

export const metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-6 lg:px-8 py-20 sm:py-24">
        <p className="heading-sans text-teal tracking-widest mb-3">SIGN IN</p>
        <h1 className="text-3xl heading-serif text-navy mb-8">My Account</h1>
        <LoginForm />
      </div>
    );
  }

  const [customer, subscriptionsEnabled, drawsEnabled, partnerOffersEnabled] =
    await Promise.all([
      customerService.getById(session.customerId) as Promise<{
        firstName: string;
        lastName: string;
        email: string;
      } | null>,
      getFeatureFlag("subscriptions_enabled"),
      getFeatureFlag("draws_enabled"),
      getFeatureFlag("partner_offers_enabled"),
    ]);

  const activeSub = subscriptionsEnabled
    ? await getActiveSubscription(session.customerId)
    : null;

  // Fetch draw info for members
  let totalEntries = 0;
  let nextDrawDate: Date | null = null;
  if (activeSub && drawsEnabled) {
    type DrawEntry = {
      entry: { id: number; entryCount: number | null; status: string };
    };
    const [entries, upcomingDraws] = await Promise.all([
      drawEntryService.getEntriesForCustomer(session.customerId, CHANNEL_ID) as Promise<DrawEntry[]>,
      getUpcomingDraws(),
    ]);
    totalEntries = entries
      .filter((e) => e.entry.status === "active")
      .reduce((sum, e) => sum + (e.entry.entryCount ?? 1), 0);
    if (upcomingDraws.length > 0 && upcomingDraws[0].scheduledAt) {
      nextDrawDate = new Date(upcomingDraws[0].scheduledAt);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-8 py-20 sm:py-24">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl heading-serif text-navy">My Account</h1>
          {activeSub && (
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-teal/10 text-teal">
              <Crown className="h-3 w-3" />
              Member
            </span>
          )}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-ink-light hover:text-navy transition-colors duration-300"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>

      {/* Member Dashboard Card */}
      {activeSub ? (
        <div className="bg-gradient-to-br from-navy to-navy-light text-white p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-slate-400 text-sm">Welcome back</p>
              <p className="text-lg font-semibold">
                {customer?.firstName} {customer?.lastName}
              </p>
              <p className="text-sm text-slate-400">{customer?.email}</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {activeSub.consecutiveMonths != null && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-teal">{activeSub.consecutiveMonths}</p>
                  <p className="text-xs text-slate-400">months</p>
                </div>
              )}
              {drawsEnabled && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-teal">{totalEntries}</p>
                  <p className="text-xs text-slate-400">draw entries</p>
                </div>
              )}
              {nextDrawDate && (
                <div className="text-center">
                  <p className="text-xs text-slate-400">Next draw</p>
                  <p className="text-sm font-medium text-white">
                    {nextDrawDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-stone p-6 mb-6">
          <h2 className="text-lg font-semibold text-navy mb-2">Welcome back</h2>
          <p className="text-ink-light">
            {customer?.firstName} {customer?.lastName}
          </p>
          <p className="text-sm text-ink-light">{customer?.email}</p>
        </div>
      )}

      {/* Non-member upsell */}
      {subscriptionsEnabled && !activeSub && (
        <div className="border-2 border-teal/20 bg-offwhite p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown className="h-5 w-5 text-teal" />
                <h3 className="font-semibold text-navy">Become a Member</h3>
              </div>
              <p className="text-sm text-ink-light">
                Unlock exclusive pricing, prize draws, free delivery, and partner discounts.
              </p>
            </div>
            <Link
              href="/membership"
              className="inline-flex items-center justify-center gap-2 bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 shrink-0"
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
            className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-navy">My Draws</h3>
              <p className="text-sm text-ink-light">{totalEntries} active entries</p>
            </div>
          </Link>
        )}
        {subscriptionsEnabled && (
          <Link
            href="/account/membership"
            className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
          >
            <Crown className="h-8 w-8 text-teal" />
            <div>
              <h3 className="font-semibold text-navy">Membership</h3>
              <p className="text-sm text-ink-light">
                {activeSub ? "Manage your plan" : "Join & save"}
              </p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-navy">Partner Offers</h3>
              <p className="text-sm text-ink-light">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/account/orders"
          className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
        >
          <Package className="h-8 w-8 text-ink-faint" />
          <div>
            <h3 className="font-semibold text-navy">Order History</h3>
            <p className="text-sm text-ink-light">View your past orders</p>
          </div>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
        >
          <FileText className="h-8 w-8 text-ink-faint" />
          <div>
            <h3 className="font-semibold text-navy">My Quotes</h3>
            <p className="text-sm text-ink-light">View and track your quotes</p>
          </div>
        </Link>
        {/* Non-member draws and partner offers */}
        {drawsEnabled && !activeSub && (
          <Link
            href="/account/draws"
            className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-navy">My Draws</h3>
              <p className="text-sm text-ink-light">Entries & prizes</p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && !activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-navy">Partner Offers</h3>
              <p className="text-sm text-ink-light">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/products"
          className="flex items-center gap-4 border border-stone p-6 hover:border-navy/30 transition-colors duration-300"
        >
          <MapPin className="h-8 w-8 text-ink-faint" />
          <div>
            <h3 className="font-semibold text-navy">Continue Shopping</h3>
            <p className="text-sm text-ink-light">Browse our products</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
