"use server";

import { refresh } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { wantsStripeTestMode } from "@keenan/services";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { getContactPermissions } from "@/lib/role-permissions";
import { isProductVisibleToViewer, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { layerCartPrice } from "@/lib/pricing/cart-pricing";

// QuoteService returns snake_case rows (transformRow convention).
type QuoteRow = { id: number; uuid: string; contact_id?: number | null; [key: string]: unknown };

async function getOrCreateQuote() {
  const uuid = await getQuoteUuid();

  if (uuid) {
    const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
    if (quote) return quote;
  }

  const quote = await quoteService.create({
    channelId: CHANNEL_ID,
    ...((await wantsStripeTestMode(CHANNEL_ID)) ? { attributes: { test_mode: true } } : {}),
  }) as QuoteRow;

  await setQuoteUuid(quote.uuid);
  return quote;
}


/** Total units in the quote — returned by item mutations so the client can
 *  update the header badge without a route re-render. */
async function countQuoteItems(quoteId: number): Promise<number> {
  const full = (await quoteService.getWithItems(quoteId)) as {
    items?: { quantity: number }[];
  } | null;
  return (full?.items ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0);
}

export async function addToQuote(productId: number, variantId?: number | null) {
  // getById returns snake_case — read sale_price (reading salePrice was undefined,
  // so quotes silently used RRP instead of the catalog sale price).
  // Same visibility gate as the cart: a product restricted away from this shopper can't be quoted.
  if (!(await isProductVisibleToViewer(productId))) return { error: RESTRICTED_PRODUCT_ERROR };

  const product = await productService.getById(productId) as { price: string; sale_price: string | null } | null;
  if (!product) return { error: "Product not found" };

  let listPrice = product.price;
  let catalogSalePrice: string | null = product.sale_price;

  if (variantId) {
    const variant = await productVariantService.getById(variantId) as { price: string | null; sale_price: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.sale_price) catalogSalePrice = variant.sale_price;
  }

  // A quote applies ONLY base price + catalog-sale suppression at add time; member
  // (cost-plus) and bulk quantity-break tiers are deliberately left off and applied
  // by staff on review (see docs/adr/0001-quote-defers-tier-pricing-to-staff.md).
  // Reuse the shared best-price-wins layerer with those two sources disabled so the
  // suppression semantics match the cart exactly (one tested definition).
  const suppress = await shouldSuppressCatalogSalePrice();
  const { salePrice } = layerCartPrice({
    listPrice,
    catalogSalePrice,
    suppress,
    memberSalePrice: null,
    bulkUnit: null,
  });

  const quote = await getOrCreateQuote();

  // Pre-link quote to customer if logged in. Best-effort convenience only — it must
  // never block adding the item. A stale/invalid session (e.g. a deleted customer)
  // would otherwise throw an FK ValidationError and 500 the whole add-to-quote,
  // leaving the quote empty with no feedback.
  const session = await getSession();
  if (session && !quote.contact_id) {
    try {
      await quoteService.update(quote.id, {
        contactId: session.contactId,
        email: session.email,
      });
    } catch (e) {
      console.error("[addToQuote] customer link failed (non-fatal):", e);
    }
  }

  const existing = await quoteItemService.findByProductVariant(quote.id, productId, variantId) as {
    id: number;
    quantity: number;
  } | null;

  if (existing) {
    const newQty = existing.quantity + 1;
    await quoteItemService.updateForParent(quote.id, existing.id, {
      quantity: newQty,
    });
  } else {
    await quoteItemService.createForParent(quote.id, {
      productId,
      variantId: variantId || null,
      quantity: 1,
      listPrice,
      salePrice,
    });
  }

  return { success: true, quoteCount: await countQuoteItems(quote.id) };
}

export async function updateQuoteItem(itemId: number, quantity: number) {
  // Guarded like updateCartItem: return { error } instead of throwing; on
  // success the fresh quoteCount lets the caller update the badge in place.
  try {
    const uuid = await getQuoteUuid();
    if (!uuid) return { error: "No quote" };

    const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
    if (!quote) return { error: "Quote not found" };

    if (quantity <= 0) {
      await quoteItemService.deleteForParent(quote.id, itemId);
    } else {
      await quoteItemService.updateForParent(quote.id, itemId, { quantity });
    }

    return { success: true, quoteCount: await countQuoteItems(quote.id) };
  } catch (e) {
    console.error("[updateQuoteItem] failed (non-fatal):", e);
    return { error: "Could not update quote" };
  }
}

export async function removeQuoteItem(itemId: number) {
  return updateQuoteItem(itemId, 0);
}

export async function getQuote() {
  const uuid = await getQuoteUuid();
  if (!uuid) return null;

  const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
  if (!quote) return null;

  return quoteService.getWithItems(quote.id);
}

export async function submitQuote(notes?: string) {
  const uuid = await getQuoteUuid();
  if (!uuid) return { error: "No quote" };

  const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
  if (!quote) return { error: "Quote not found" };

  const session = await getSession();
  if (!session) return { error: "login_required" };

  // B2B account-role gate — `submit_quotes` (Zoey Usage Restriction). Accountless
  // (B2C) contacts bypass; the resolver fails open on DB error.
  // docs/crm-parity/10-role-enforcement.md
  const perms = await getContactPermissions(session.contactId);
  if (perms.isB2B && !perms.can("submit_quotes")) {
    return {
      error:
        "Your role on this account doesn't allow submitting quote requests. Ask your account administrator to submit it for you.",
    };
  }

  // Attach customer identity + notes. The quote stays in `quote_pending`
  // (Zoey lifecycle): the sales team reviews it in the portal and sends
  // pricing back via markSent → quote_available. The submitted_at attribute
  // distinguishes a customer-submitted request from an in-progress draft
  // (both share the quote_pending status).
  const existingAttributes = (quote.attributes ?? {}) as Record<string, unknown>;
  await quoteService.update(quote.id, {
    contactId: session.contactId,
    email: session.email,
    customerNotes: notes || null,
    attributes: { ...existingAttributes, submitted_at: new Date().toISOString() },
  });
  await clearQuoteUuid();

  refresh(); // acting user's view refreshes; shared data cache stays intact
  return { success: true };
}

export async function getQuotesForCustomer() {
  const session = await getSession();
  if (!session) return { error: "Not logged in", quotes: [] };

  // Contact-keyed (identity unification). Mirrors the old listForCustomer
  // semantics: this channel's quotes for the subject, hiding in-progress
  // drafts (quote_pending), newest first.
  const result = await quoteService.list({
    page: 1,
    limit: 100,
    sort: "created_at",
    direction: "desc",
    filters: {
      contact_id: { type: "eq", value: session.contactId },
      channel_id: { type: "eq", value: CHANNEL_ID },
    },
  });
  const contactQuotes = (result.data as Array<{ status?: string | null }>).filter(
    (q) => q.status !== "quote_pending"
  );
  return { quotes: contactQuotes };
}
