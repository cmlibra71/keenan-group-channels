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
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Account</h1>
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
                {customer?.firstName} {customer?.lastName}
              </p>
              <p className="text-sm text-zinc-400">{customer?.email}</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {activeSub.consecutiveMonths != null && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{activeSub.consecutiveMonths}</p>
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
            {customer?.firstName} {customer?.lastName}
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
                Unlock exclusive pricing, prize draws, free delivery, and partner discounts.
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
