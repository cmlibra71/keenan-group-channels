"use client";

// ============================================================================
// The customer's wishlist on /account/wishlist — the sealed native `wishlist-items`, inside the
// channel's `account-wishlist` master.
//
// What it does (Magento's "My Wishlist", the parity reference): one row per saved product with its
// picture and name (linking to the product), the shopper's own comment, a quantity, Add to Cart,
// Add to Quote and Remove; "Update Wishlist" saves every changed comment and quantity in one go
// (a quantity of 0 removes the row, as Magento's does). On first paint it claims the add a guest
// asked for before signing in, and announces it.
//
// Every word is a node prop on the master (see `ACCOUNT_WISHLIST_WORD_KEYS` in
// `lib/wishlist/wishlist-copy.ts`); a missing word is not printed, and a button whose label is
// missing is not drawn. Edits apply the rows the action returns — no page refresh.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import type { WishlistLine } from "@keenan/services";
import { claimPendingWishlistAdd, removeFromWishlist, updateWishlist } from "@/lib/actions/wishlist";
import { addToCart } from "@/lib/actions/cart";
import { addToQuote } from "@/lib/actions/quote";
import { useCartQuoteCounts, useHeaderPanels } from "@/lib/cart-quote-counts";
import { fillWishlistWord, wishlistWord } from "@/lib/wishlist/wishlist-copy";

export interface WishlistItemsProps extends Record<string, unknown> {
  initialItems: WishlistLine[];
  /** `?added=<item id>` — the line the page was opened to announce. */
  addedItemId: number | null;
}

type Draft = { quantity: string; comment: string };
type Notice = { tone: "ok" | "error"; text: string; href?: string; hrefLabel?: string } | null;

function draftOf(line: WishlistLine): Draft {
  return { quantity: String(line.quantity), comment: line.comment ?? "" };
}

export function WishlistItems(props: WishlistItemsProps) {
  const w = (key: string) => wishlistWord(props, key);
  const [items, setItems] = useState<WishlistLine[]>(props.initialItems);
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(props.initialItems.map((l) => [l.id, draftOf(l)]))
  );
  const [notice, setNotice] = useState<Notice>(() => {
    const line = props.initialItems.find((l) => l.id === props.addedItemId);
    const added = w("label_added");
    return line && added ? { tone: "ok", text: fillWishlistWord(added, { product: line.name }) } : null;
  });
  const [pending, startTransition] = useTransition();
  const { setCartCount, setQuoteCount } = useCartQuoteCounts();
  const { open } = useHeaderPanels();
  const claimed = useRef(false);

  // The add a guest asked for before signing in — claimed once, by POST, after first paint.
  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;
    void claimPendingWishlistAdd()
      .then((res) => {
        if (!res.ok) {
          if (res.error !== "sign_in_required") setNotice({ tone: "error", text: res.error });
          return;
        }
        const line = res.added;
        if (!line) return;
        setItems((prev) => [line, ...prev.filter((l) => l.id !== line.id)]);
        setDrafts((prev) => ({ ...prev, [line.id]: draftOf(line) }));
        const added = wishlistWord(props, "label_added");
        if (added) setNotice({ tone: "ok", text: fillWishlistWord(added, { product: line.name }) });
      })
      .catch(() => {});
    // Runs once per mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(
    () =>
      items.filter((l) => {
        const d = drafts[l.id];
        return d && (d.quantity.trim() !== String(l.quantity) || d.comment.trim() !== (l.comment ?? ""));
      }),
    [items, drafts]
  );

  const applyLines = (next: WishlistLine[], removedIds: number[]) => {
    const byId = new Map(next.map((l) => [l.id, l]));
    setItems((prev) => prev.filter((l) => !removedIds.includes(l.id)).map((l) => byId.get(l.id) ?? l));
    setDrafts((prev) => {
      const copy = { ...prev };
      for (const id of removedIds) delete copy[id];
      for (const l of next) copy[l.id] = draftOf(l);
      return copy;
    });
  };

  const run = (fn: () => Promise<void>) => {
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      }
    });
  };

  const onUpdate = () =>
    run(async () => {
      const updates = dirty.map((l) => {
        const d = drafts[l.id];
        const quantity = d.quantity.trim();
        return {
          itemId: l.id,
          // A cleared box is "no change", never an error and never a removal (0 removes).
          ...(quantity !== "" && quantity !== String(l.quantity) ? { quantity } : {}),
          ...(d.comment.trim() !== (l.comment ?? "") ? { comment: d.comment } : {}),
        };
      });
      if (updates.length === 0) return;
      const res = await updateWishlist(updates);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      applyLines(res.items, res.removed_ids);
      const saved = w("label_updated");
      if (saved) setNotice({ tone: "ok", text: saved });
    });

  const onRemove = (line: WishlistLine) =>
    run(async () => {
      const res = await removeFromWishlist(line.id);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      applyLines([], [line.id]);
    });

  const quantityOf = (line: WishlistLine): number => {
    const n = Number(drafts[line.id]?.quantity ?? line.quantity);
    return Number.isInteger(n) && n > 0 ? n : line.quantity;
  };

  const onAddToCart = (line: WishlistLine) =>
    run(async () => {
      const res = (await addToCart(line.product_id, line.variant_id, quantityOf(line))) as {
        success?: boolean;
        cartCount?: number;
        error?: string;
        productPage?: string;
      };
      if (res.error) {
        return setNotice({
          tone: "error",
          text: res.error,
          ...(res.productPage ? { href: res.productPage, hrefLabel: line.name } : {}),
        });
      }
      if (typeof res.cartCount === "number") setCartCount(res.cartCount);
      open("cart");
      const done = w("label_added_to_cart");
      if (done) setNotice({ tone: "ok", text: fillWishlistWord(done, { product: line.name }) });
    });

  const onAddToQuote = (line: WishlistLine) =>
    run(async () => {
      const res = (await addToQuote(line.product_id, line.variant_id)) as {
        success?: boolean;
        quoteCount?: number;
        error?: string;
      };
      if (res.error) return setNotice({ tone: "error", text: res.error });
      if (typeof res.quoteCount === "number") setQuoteCount(res.quoteCount);
      open("quote");
      const done = w("label_added_to_quote");
      if (done) setNotice({ tone: "ok", text: fillWishlistWord(done, { product: line.name }) });
    });

  const labelProduct = w("label_product");
  const labelComment = w("label_comment");
  const labelQty = w("label_quantity");
  const labelCart = w("label_add_to_cart");
  const labelQuote = w("label_add_to_quote");
  const labelRemove = w("label_remove");
  const labelUpdate = w("label_update");
  const labelContinue = w("label_continue");
  const placeholder = w("label_comment_placeholder") ?? undefined;

  return (
    <div className="space-y-4" data-testid="wishlist-items" aria-busy={pending}>
      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`border px-4 py-3 text-sm ${
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-800"
          }`}
          data-testid="wishlist-notice"
        >
          {notice.text}
          {notice.href ? (
            <>
              {" "}
              <Link href={notice.href} className="font-medium underline">
                {notice.hrefLabel}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        w("label_empty") ? (
          <p className="text-sm text-zinc-600" data-testid="wishlist-empty">
            {w("label_empty")}
          </p>
        ) : null
      ) : (
        <ul className="divide-y divide-zinc-200 border border-zinc-200 bg-white" data-testid="wishlist-rows">
          {labelProduct || labelComment || labelQty ? (
            <li className="hidden grid-cols-[1fr_1fr_auto] gap-4 bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 md:grid">
              <span>{labelProduct}</span>
              <span>{labelComment}</span>
              <span className="text-right">{labelQty}</span>
            </li>
          ) : null}
          {items.map((line) => {
            const href = `/products/${line.url_path || line.product_id}`;
            const draft = drafts[line.id] ?? draftOf(line);
            const sku = line.variant_sku || line.sku;
            return (
              <li key={line.id} className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_1fr_auto]" data-testid="wishlist-row" data-item-id={line.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <Link href={href} className="block h-20 w-20 shrink-0 overflow-hidden border border-zinc-200 bg-white">
                    {line.image_url ? (
                      <Image src={line.image_url} alt={line.name} width={80} height={80} className="h-20 w-20 object-contain" />
                    ) : null}
                  </Link>
                  <div className="min-w-0">
                    <Link href={href} className="text-sm font-semibold text-zinc-900 hover:underline">
                      {line.name}
                    </Link>
                    {sku ? <p className="mt-1 text-xs text-zinc-500">{sku}</p> : null}
                  </div>
                </div>
                <label className="block text-sm">
                  {labelComment ? <span className="mb-1 block text-xs text-zinc-500 md:sr-only">{labelComment}</span> : null}
                  <textarea
                    value={draft.comment}
                    onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: { ...draft, comment: e.target.value } }))}
                    maxLength={1000}
                    rows={2}
                    placeholder={placeholder}
                    aria-label={labelComment ?? undefined}
                    className="w-full border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-900 focus:outline-none"
                  />
                </label>
                <div className="flex flex-col items-stretch gap-2 md:items-end">
                  <label className="flex items-center gap-2 text-sm md:justify-end">
                    {labelQty ? <span className="text-xs text-zinc-500 md:sr-only">{labelQty}</span> : null}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={9999}
                      step={1}
                      value={draft.quantity}
                      onChange={(e) => setDrafts((p) => ({ ...p, [line.id]: { ...draft, quantity: e.target.value } }))}
                      aria-label={labelQty ?? undefined}
                      className="w-20 border border-zinc-300 px-2 py-1 text-right text-sm focus:border-zinc-900 focus:outline-none"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {labelCart ? (
                      <button
                        type="button"
                        onClick={() => onAddToCart(line)}
                        disabled={pending}
                        className="bg-zinc-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-zinc-700 disabled:opacity-60"
                        data-testid="wishlist-add-to-cart"
                      >
                        {labelCart}
                      </button>
                    ) : null}
                    {labelQuote ? (
                      <button
                        type="button"
                        onClick={() => onAddToQuote(line)}
                        disabled={pending}
                        className="border border-zinc-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
                        data-testid="wishlist-add-to-quote"
                      >
                        {labelQuote}
                      </button>
                    ) : null}
                  </div>
                  {labelRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(line)}
                      disabled={pending}
                      className="text-xs text-zinc-500 hover:text-red-600 hover:underline disabled:opacity-60 md:text-right"
                      data-testid="wishlist-remove"
                    >
                      {labelRemove}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {labelContinue ? (
          <Link href="/products" className="text-sm text-zinc-700 hover:underline">
            {labelContinue}
          </Link>
        ) : (
          <span />
        )}
        {items.length > 0 && labelUpdate ? (
          <button
            type="button"
            onClick={onUpdate}
            disabled={pending || dirty.length === 0}
            className="border border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
            data-testid="wishlist-update"
          >
            {labelUpdate}
          </button>
        ) : null}
      </div>
    </div>
  );
}
