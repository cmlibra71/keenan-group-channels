"use server";

import { revalidatePath, refresh } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice, wantStripeTestMode } from "@/lib/store";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { layerCartPrice } from "@/lib/pricing/cart-pricing";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { sendStaffNotification } from "@/lib/staff-email";

// QuoteService returns snake_case rows (transformRow convention).
type QuoteRow = { id: number; uuid: string; contact_id?: number | null; [key: string]: unknown };

async function getOrCreateQuote() {
  const uuid = await getQuoteUuid();

  if (uuid) {
    const quote = (await quoteService.getByUuid(uuid)) as QuoteRow | null;
    if (quote) return quote;
  }

  // Tag quotes created in payments test mode so they can be cleared from the portal.
  const quote = await quoteService.create({
    channelId: CHANNEL_ID,
    ...((await wantStripeTestMode()) ? { attributes: { test_mode: true } } : {}),
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

  refresh(); // acting user's view refreshes; shared data cache stays intact
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

  refresh(); // acting user's view refreshes; shared data cache stays intact
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

// Customer self-service: accept a finalised quote (B2B). quote_available / open_change_request → accepted.
export async function acceptQuote(quoteId: number) {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in." };
  const q = (await quoteService.getWithItems(quoteId)) as (QuoteRow & { status?: string }) | null;
  if (!q || q.contact_id !== session.contactId || q.channel_id !== CHANNEL_ID) return { error: "Quote not found." };
  if (!["quote_available", "open_change_request"].includes(String(q.status))) {
    return { error: "This quote can't be accepted yet." };
  }
  // Lifecycle method, NOT a bare status update: stamps accepted_at and writes
  // the quote.accepted audit row. The generic update() fired no side effects,
  // which is why acceptances used to be invisible to staff.
  await quoteService.markAccepted(quoteId);

  // Best-effort staff alert — the acceptance already succeeded; never fail the
  // customer's action because the notification couldn't send.
  try {
    const label = String(q.quote_number ?? `#${quoteId}`);
    await sendStaffNotification({
      subject: `Quote ${label} accepted by customer`,
      heading: "A customer accepted a quote",
      rows: [
        ["Quote", label],
        ["Name", String(q.quote_name ?? "—")],
        ["Customer email", String(q.email ?? "—")],
        ["Amount", q.quote_amount == null ? "—" : `$${Number(q.quote_amount).toFixed(2)}`],
      ],
      portalPath: `/dashboard/quotes/${quoteId}`,
      linkLabel: "Open quote in portal",
    });
  } catch (e) {
    console.error("[acceptQuote] staff notification failed (non-fatal):", e);
  }
  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");
  return { success: true };
}

// Customer self-service: duplicate a quote into a fresh editable quote (same items).
export async function duplicateQuote(quoteId: number) {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in." };
  // Guard against a spammed "Duplicate" button (or a direct action call that
  // bypasses the client-side disabled state) creating unbounded quotes. Per-customer
  // sliding window — generous for real use, fatal to abuse.
  if (!slidingWindowAllow(`quote-duplicate:${session.contactId}`, { windowMs: 60_000, max: 5 })) {
    return { error: "You've duplicated several quotes just now. Please wait a minute before duplicating again." };
  }
  const q = (await quoteService.getWithItems(quoteId)) as
    | (QuoteRow & { email?: string | null; items?: Array<Record<string, unknown>> })
    | null;
  if (!q || q.contact_id !== session.contactId || q.channel_id !== CHANNEL_ID) return { error: "Quote not found." };
  const copy = (await quoteService.create({
    channelId: CHANNEL_ID,
    contactId: session.contactId,
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
