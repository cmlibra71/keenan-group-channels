"use server";

import { revalidatePath } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { wantsStripeTestMode } from "@keenan/services";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { layerCartPrice } from "@/lib/pricing/cart-pricing";

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
    ...((await wantsStripeTestMode(CHANNEL_ID)) ? { attributes: { test_mode: true } } : {}),
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
