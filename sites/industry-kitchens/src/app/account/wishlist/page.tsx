import { redirect } from "next/navigation";
import Link from "next/link";
import { Heart } from "lucide-react";
import { listContactWishlist } from "@keenan/services";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { productService } from "@/lib/store";
import { isProductVisibleToViewer } from "@/lib/catalog-scope";
import { removeFromWishlist } from "@/lib/actions/wishlist";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = { title: "My Wishlist" };

export default async function WishlistPage() {
  const session = await getSession();
  if (!session) redirect(signInRedirect("/account/wishlist"));
  const ids = await listContactWishlist(session.contactId);
  const rows = await Promise.all(
    ids.map(async (id) => {
      if (!(await isProductVisibleToViewer(id))) return null;
      const p = (await productService.getById(id).catch(() => null)) as { id: number; name?: string; url_path?: string; urlPath?: string } | null;
      return p ? { id, name: String(p.name ?? ""), href: `/products/${p.url_path ?? p.urlPath ?? ""}` } : null;
    })
  );
  const items = rows.filter((r): r is { id: number; name: string; href: string } => r !== null);

  return (
    <AccountShell>
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Wishlist</h1>
      {items.length === 0 ? (
        <div className="text-center py-16">
          <Heart className="h-16 w-16 text-zinc-300 mx-auto" />
          <p className="mt-4 text-zinc-500">Your wishlist is empty.</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-4 p-4">
              <Link href={it.href} className="font-medium text-zinc-900 hover:underline">
                {it.name}
              </Link>
              <form action={removeFromWishlist}>
                <input type="hidden" name="productId" value={it.id} />
                <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
