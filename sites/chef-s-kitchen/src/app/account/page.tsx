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
      <div className="mx-auto max-w-lg px-6 lg:px-8 section-padding">
        <p className="eyebrow mb-3">SIGN IN</p>
        <h1 className="text-3xl heading-serif text-text-primary mb-8">My Account</h1>
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
    <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl heading-serif text-text-primary">My Account</h1>
          {activeSub && (
            <span className="badge-member">
              <Crown className="h-3 w-3" />
              Member
            </span>
          )}
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-300"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>

      {/* Member Dashboard Card */}
      {activeSub ? (
        <div className="bg-gradient-to-br from-surface-dark to-surface-dark-alt text-white p-6 mb-6">
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
                  <p className="text-2xl font-bold text-accent">{activeSub.consecutiveMonths}</p>
                  <p className="text-xs text-slate-400">months</p>
                </div>
              )}
              {drawsEnabled && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-accent">{totalEntries}</p>
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
        <div className="card-padded mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-2">Welcome back</h2>
          <p className="text-text-secondary">
            {customer?.firstName} {customer?.lastName}
          </p>
          <p className="text-sm text-text-secondary">{customer?.email}</p>
        </div>
      )}

      {/* Non-member upsell */}
      {subscriptionsEnabled && !activeSub && (
        <div className="border-2 border-accent/20 bg-surface-primary p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Crown className="h-5 w-5 text-accent" />
                <h3 className="font-semibold text-text-primary">Become a Member</h3>
              </div>
              <p className="text-sm text-text-secondary">
                Unlock exclusive pricing, prize draws, and partner discounts.
              </p>
            </div>
            <Link
              href="/membership"
              className="btn-primary shrink-0"
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
            className="flex items-center gap-4 card-interactive"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-text-primary">My Draws</h3>
              <p className="text-sm text-text-secondary">{totalEntries} active entries</p>
            </div>
          </Link>
        )}
        {subscriptionsEnabled && (
          <Link
            href="/account/membership"
            className="flex items-center gap-4 card-interactive"
          >
            <Crown className="h-8 w-8 text-accent" />
            <div>
              <h3 className="font-semibold text-text-primary">Membership</h3>
              <p className="text-sm text-text-secondary">
                {activeSub ? "Manage your plan" : "Join & save"}
              </p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 card-interactive"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-text-primary">Partner Offers</h3>
              <p className="text-sm text-text-secondary">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/account/orders"
          className="flex items-center gap-4 card-interactive"
        >
          <Package className="h-8 w-8 text-text-muted" />
          <div>
            <h3 className="font-semibold text-text-primary">Order History</h3>
            <p className="text-sm text-text-secondary">View your past orders</p>
          </div>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-4 card-interactive"
        >
          <FileText className="h-8 w-8 text-text-muted" />
          <div>
            <h3 className="font-semibold text-text-primary">My Quotes</h3>
            <p className="text-sm text-text-secondary">View and track your quotes</p>
          </div>
        </Link>
        {/* Non-member draws and partner offers */}
        {drawsEnabled && !activeSub && (
          <Link
            href="/account/draws"
            className="flex items-center gap-4 card-interactive"
          >
            <Trophy className="h-8 w-8 text-purple-500" />
            <div>
              <h3 className="font-semibold text-text-primary">My Draws</h3>
              <p className="text-sm text-text-secondary">Entries & prizes</p>
            </div>
          </Link>
        )}
        {partnerOffersEnabled && !activeSub && (
          <Link
            href="/account/partner-offers"
            className="flex items-center gap-4 card-interactive"
          >
            <Gift className="h-8 w-8 text-blue-500" />
            <div>
              <h3 className="font-semibold text-text-primary">Partner Offers</h3>
              <p className="text-sm text-text-secondary">Exclusive discounts</p>
            </div>
          </Link>
        )}
        <Link
          href="/products"
          className="flex items-center gap-4 card-interactive"
        >
          <MapPin className="h-8 w-8 text-text-muted" />
          <div>
            <h3 className="font-semibold text-text-primary">Continue Shopping</h3>
            <p className="text-sm text-text-secondary">Browse our products</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
