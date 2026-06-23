"use server";

import { revalidatePath } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";

// QuoteService returns snake_case rows (transformRow convention).
type QuoteRow = { id: number; uuid: string; customer_id?: number | null; [key: string]: unknown };

async function getOrCreateQuote() {
  const uuid = await getQuoteUuid();

  if (uuid) {
    const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
    if (quote) return quote;
  }

  const quote = await quoteService.create({
    channelId: CHANNEL_ID,
  }) as QuoteRow;

  await setQuoteUuid(quote.uuid);
  return quote;
}

export async function addToQuote(productId: number, variantId?: number | null) {
  // getById returns snake_case — read sale_price (reading salePrice was undefined,
  // so quotes silently used RRP instead of the catalog sale price).
  const product = await productService.getById(productId) as { price: string; sale_price: string | null } | null;
  if (!product) return { error: "Product not found" };

  let listPrice = product.price;
  let salePrice = product.sale_price;

  if (variantId) {
    const variant = await productVariantService.getById(variantId) as { price: string | null; sale_price: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.sale_price) salePrice = variant.sale_price;
  }

  // Member-only pricing channels quote at RRP — the shared catalog sale price
  // is another channel's public price. Staff apply tier pricing on review.
  if (await shouldSuppressCatalogSalePrice()) {
    salePrice = null;
  }

  const quote = await getOrCreateQuote();

  // Pre-link quote to customer if logged in
  const session = await getSession();
  if (session && !quote.customer_id) {
    await quoteService.update(quote.id, {
      customerId: session.customerId,
      email: session.email,
    });
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

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateQuoteItem(itemId: number, quantity: number) {
  const uuid = await getQuoteUuid();
  if (!uuid) return { error: "No quote" };

  const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
  if (!quote) return { error: "Quote not found" };

  if (quantity <= 0) {
    await quoteItemService.deleteForParent(quote.id, itemId);
  } else {
    await quoteItemService.updateForParent(quote.id, itemId, { quantity });
  }

  revalidatePath("/", "layout");
  return { success: true };
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

  // Attach customer identity + notes. The quote stays in `quote_pending`
  // (Zoey lifecycle): the sales team reviews it in the portal and sends
  // pricing back via markSent → quote_available. The submitted_at attribute
  // distinguishes a customer-submitted request from an in-progress draft
  // (both share the quote_pending status).
  const existingAttributes = (quote.attributes ?? {}) as Record<string, unknown>;
  await quoteService.update(quote.id, {
    customerId: session.customerId,
    email: session.email,
    customerNotes: notes || null,
    attributes: { ...existingAttributes, submitted_at: new Date().toISOString() },
  });
  await clearQuoteUuid();

  revalidatePath("/", "layout");
  return { success: true };
}

export async function getQuotesForCustomer() {
  const session = await getSession();
  if (!session) return { error: "Not logged in", quotes: [] };

  const customerQuotes = await quoteService.listForCustomer(session.customerId, CHANNEL_ID);
  return { quotes: customerQuotes };
}

// Customer self-service: accept a finalised quote (B2B). quote_available / open_change_request → accepted.
export async function acceptQuote(quoteId: number) {
  const session = await getSession();
  if (!session?.customerId) return { error: "Please sign in." };
  const q = (await quoteService.getWithItems(quoteId)) as (QuoteRow & { status?: string }) | null;
  if (!q || q.customer_id !== session.customerId) return { error: "Quote not found." };
  if (!["quote_available", "open_change_request"].includes(String(q.status))) {
    return { error: "This quote can't be accepted yet." };
  }
  await quoteService.update(quoteId, { status: "quote_accepted" });
  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");
  return { success: true };
}

// Customer self-service: duplicate a quote into a fresh editable quote (same items).
export async function duplicateQuote(quoteId: number) {
  const session = await getSession();
  if (!session?.customerId) return { error: "Please sign in." };
  const q = (await quoteService.getWithItems(quoteId)) as
    | (QuoteRow & { email?: string | null; items?: Array<Record<string, unknown>> })
    | null;
  if (!q || q.customer_id !== session.customerId) return { error: "Quote not found." };
  const copy = (await quoteService.create({
    channelId: CHANNEL_ID,
    customerId: session.customerId,
    email: q.email ?? session.email,
  })) as QuoteRow;
  for (const it of q.items ?? []) {
    try {
      await quoteItemService.createForParent(copy.id, {
        productId: Number(it.product_id),
        variantId: (it.variant_id as number | null) ?? null,
        quantity: Number(it.quantity) || 1,
        listPrice: (it.list_price as string) ?? "0",
        salePrice: (it.sale_price as string) ?? null,
      });
    } catch {
      /* skip a line that fails rather than losing the duplicate */
    }
  }
  revalidatePath("/account/quotes");
  return { success: true, quoteId: copy.id };
}
