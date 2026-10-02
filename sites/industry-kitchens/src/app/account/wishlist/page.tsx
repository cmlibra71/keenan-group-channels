import { notFound, redirect } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { listWishlistLines } from "@keenan/services";
import { CHANNEL_ID, getComponents, getFeatureFlag, getNamedStyles } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { applyCatalogScopeBy } from "@/lib/catalog-scope";
import { AccountShell } from "@/components/account/AccountShell";
import { WishlistPageTree } from "@/components/wishlist/WishlistPageTree";
import { parseAddedParam } from "@/lib/wishlist/pending-add";

// ============================================================================
// /account/wishlist — the signed-in customer's wishlist (Industry Kitchens, 2026-10-02).
//
// SWITCHED by the channel setting `wishlist_enabled` (absent = off → 404, so the page does not
// exist on Chefs Depot). Signed out → the sign-in panel, back here afterwards (where a guest's
// pending add is then claimed). The page is the channel's `account-wishlist` CMS master; the rows
// are this contact's own list on this channel, through the storefront's catalogue scope.
// ============================================================================

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function WishlistPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!(await getFeatureFlag("wishlist_enabled").catch(() => false))) notFound();
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/wishlist"));

  const query = await searchParams;
  const [lines, components, namedStyles] = await Promise.all([
    listWishlistLines({ contactId: session.contactId, channelId: CHANNEL_ID }),
    getComponents().catch(() => ({})),
    getNamedStyles().catch(() => ({})),
  ]);
  const items = await applyCatalogScopeBy(lines, (l) => l.product_id);

  return (
    <AccountShell>
      <WishlistPageTree
        items={items}
        addedItemId={parseAddedParam(query.added)}
        components={components as Record<string, NodeTree>}
        namedStyles={namedStyles as Record<string, string[]>}
      />
    </AccountShell>
  );
}
