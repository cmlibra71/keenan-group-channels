"use server";

import { revalidatePath } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID } from "@/lib/store";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";

async function getOrCreateQuote() {
  const uuid = await getQuoteUuid();

  if (uuid) {
    const quote = await quoteService.getByUuid(uuid);
    if (quote) return quote;
  }

  const quote = await quoteService.create({
    channelId: CHANNEL_ID,
  }) as { id: number; uuid: string; [key: string]: unknown };

  await setQuoteUuid(quote.uuid);
  return quote;
}

export async function addToQuote(productId: number, variantId?: number | null) {
  const product = await productService.getById(productId) as { price: string; salePrice: string | null } | null;
  if (!product) return { error: "Product not found" };

  let listPrice = product.price;
  let salePrice = product.salePrice;

  if (variantId) {
    const variant = await productVariantService.getById(variantId) as { price: string | null; salePrice: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.salePrice) salePrice = variant.salePrice;
  }

  const quote = await getOrCreateQuote();

  // Pre-link quote to customer if logged in
  const session = await getSession();
  if (session && !quote.customerId) {
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

  const quote = await quoteService.getByUuid(uuid);
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

  const quote = await quoteService.getByUuid(uuid);
  if (!quote) return null;

  return quoteService.getWithItems(quote.id);
}

export async function submitQuote(notes?: string) {
  const uuid = await getQuoteUuid();
  if (!uuid) return { error: "No quote" };

  const quote = await quoteService.getByUuid(uuid);
  if (!quote) return { error: "Quote not found" };

  const session = await getSession();
  if (!session) return { error: "login_required" };

  // Attach customer identity to quote
  await quoteService.update(quote.id, {
    customerId: session.customerId,
    email: session.email,
  });

  await quoteService.markSubmitted(quote.id, notes);
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
