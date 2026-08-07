import { cache } from "react";
import { getFeatureFlag } from "@/lib/store";
import { buildAccountNavItems } from "@/lib/account/account-nav-items";
import { AccountNav } from "./AccountNav";

/**
 * The two-column frame every SIGNED-IN account page renders inside.
 *
 * It is an explicit wrapper rather than a Next route layout on purpose. The nav
 * must appear on /account/quotes but NOT on /account/register, /account/reset-password,
 * the membership subscribe flow, or the signed-out /account login form — a layout
 * cannot see the pathname, and a route group to carve out the exceptions would
 * collide with the nested /account/membership/subscribe segment. Opting each page
 * in makes the exclusion list a fact of the code instead of a regex nobody
 * maintains.
 *
 * Pages pass their own content unchanged; the shell owns the page gutter and the
 * max width, so a page must NOT bring its own `mx-auto max-w-*`.
 */

/**
 * The three flags, read once per request.
 *
 * `/account` itself also reads them for its card grid, and React's `cache()`
 * dedupes those three channel_settings lookups across the shell and the page.
 */
export const readAccountNavFlags = cache(async () => {
  const [subscriptionsEnabled, drawsEnabled, partnerOffersEnabled] = await Promise.all([
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("draws_enabled"),
    getFeatureFlag("partner_offers_enabled"),
  ]);
  return { subscriptionsEnabled, drawsEnabled, partnerOffersEnabled };
});

export async function AccountShell({ children }: { children: React.ReactNode }) {
  const items = buildAccountNavItems(await readAccountNavFlags());

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="flex flex-col gap-8 lg:flex-row">
        <AccountNav items={items} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
