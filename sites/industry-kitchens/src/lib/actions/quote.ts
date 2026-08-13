"use server";

import { revalidatePath, refresh } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { wantsStripeTestMode } from "@keenan/services";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { slidingWindowAllow } from "@/lib/rate-limit";
import {
  quoteHidesPrices,
  resolveQuoteAcceptState,
  isQuoteExpired,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { isStaffOnlyDraft, withoutStaffOnlyDrafts } from "@/lib/quotes/draft-visibility";
import { getContactPermissions } from "@/lib/role-permissions";
import { isProductVisibleToViewer, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { layerCartPrice } from "@/lib/pricing/cart-pricing";
import {
  describeKitChoices,
  readProductKit,
  resolveKitChoices,
  type KitChoice,
} from "@/lib/product-kit";
import { kitNoteWrite, mergeKitAttributes, readOwnKitNote } from "@/lib/quotes/kit-line";

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

export async function addToQuote(
  productId: number,
  variantId?: number | null,
  kitChoices?: KitChoice[] | null
) {
  // getById returns snake_case — read sale_price (reading salePrice was undefined,
  // so quotes silently used RRP instead of the catalog sale price).
  // Same visibility gate as the cart: a product restricted away from this shopper can't be quoted.
  if (!(await isProductVisibleToViewer(productId))) return { error: RESTRICTED_PRODUCT_ERROR };

  const product = await productService.getById(productId) as {
    price: string;
    sale_price: string | null;
    metafields?: unknown;
  } | null;
  if (!product) return { error: "Product not found" };

  // ── Kit products (Zoey grouped / bundle, authored in the portal) ──────────────────────────
  // A BUNDLE is a modular configuration: it is not priced live, its picks come through as a
  // quote request (Steve, card 7bmpuqei). The choices arrive as group names + product ids and are
  // re-resolved against the product's OWN kit here, so nothing a browser sends can invent a line.
  // A GROUPED kit has no choices — its contents ride along so the rep can see what the one price
  // covers without opening the product.
  const kit = readProductKit(product.metafields);
  // What this add contributes to the line's attributes bag — MERGED into whatever is already
  // there, never written over it: the same column carries the indent tick (card Iy3jZrMl), the
  // custom-line approval (card p888Rl1q) and the Zoey ingest's own keys, and a storefront add must
  // not silently drop any of them.
  let kitAttributes: Record<string, unknown> | null = null;
  let kitNote: string | null = null;
  if (kit?.kind === "bundle") {
    const resolved = resolveKitChoices(kit, kitChoices);
    if (!resolved) {
      return { error: "Choose an option in every group before adding this to a quote." };
    }
    kitNote = describeKitChoices(resolved);
    kitAttributes = { kit_kind: "bundle", kit_selection: resolved, kit_note: kitNote };
  } else if (kit?.kind === "grouped") {
    kitAttributes = {
      kit_kind: "grouped",
      kit_contents: kit.items.map((i) => ({
        product_id: i.productId,
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
      })),
    };
    // A grouped kit's contents are the PRODUCT's own definition and are on its page, so they ride
    // along structurally for the rep and are deliberately NOT written into the customer-visible
    // line comment. Only a bundle — a configuration the customer built, recorded nowhere else —
    // gets that.
  }

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
    customer_notes?: string | null;
    attributes?: unknown;
  } | null;

  if (existing) {
    const merged = mergeKitAttributes(existing.attributes, kitAttributes);
    // A quote may hold only ONE line per product+variant, so re-configuring a bundle REPLACES the
    // captured configuration on the line the customer already has (and does not stack a second
    // quantity onto a different build). Everything else keeps counting up as before.
    const reconfigured = kit?.kind === "bundle" && kitNote !== readOwnKitNote(existing.attributes);
    await quoteItemService.updateForParent(quote.id, existing.id, {
      quantity: reconfigured ? existing.quantity : existing.quantity + 1,
      ...(merged ? { attributes: merged } : {}),
      ...(kitNoteWrite(existing.customer_notes, existing.attributes, kitNote) ?? {}),
    });
  } else {
    await quoteItemService.createForParent(quote.id, {
      productId,
      variantId: variantId || null,
      quantity: 1,
      listPrice,
      salePrice,
      ...(kitAttributes ? { attributes: kitAttributes } : {}),
      ...(kitNote ? { customerNotes: kitNote } : {}),
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
  // …and a staff-only Draft is not the customer's quote at all, whoever's contact
  // the portal's "Duplicate to Draft" hung it off.
  const contactQuotes = withoutStaffOnlyDrafts(
    (result.data as Array<{ status?: string | null }>).filter((q) => q.status !== "quote_pending")
  );
  return { quotes: contactQuotes };
}

// ============================================================================
// Customer quote lifecycle - ported from template/ 2026-08-04.
//
// These were missing here entirely, which is the real content of the seam
// audit's "IK quote gap": not a broken notification, but NO WAY FOR AN IK
// CUSTOMER TO ACCEPT A QUOTE. Ported verbatim so the two sites cannot drift
// again - every dependency (role permissions, rate limit, staff email)
// already existed here, unused.
// ============================================================================

// Customer self-service: accept a finalised quote (B2B). Only a priced, sent,
// in-date quote (quote_available) can be accepted.
export async function acceptQuote(quoteId: number) {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in." };
  const q = (await quoteService.getWithItems(quoteId)) as
    | (QuoteRow & { status?: string; hide_prices?: boolean | null; expires_at?: Date | string | null })
    | null;
  if (!q || q.contact_id !== session.contactId || q.channel_id !== CHANNEL_ID) return { error: "Quote not found." };

  // Enforced HERE, not just hidden in the UI — the action is callable directly.
  // Same resolver the page renders the button from, so the two can't drift.
  // Note this deliberately no longer accepts `open_change_request`: while a change
  // request is open there is no settled quote to accept.
  const acceptState = resolveQuoteAcceptState({
    status: q.status,
    hidesPrices: quoteHidesPrices(
      { status: q.status, hide_prices: q.hide_prices },
      await getHidePriceStatuses()
    ),
    expires_at: q.expires_at,
  });
  if (acceptState.kind !== "enabled") {
    return {
      error: isQuoteExpired(q.expires_at)
        ? "This quote has expired. Please contact your sales rep for an updated quote."
        : "This quote can't be accepted yet.",
    };
  }

  // B2B account-role gates (docs/crm-parity/10-role-enforcement.md). Accepting a
  // finalised quote IS the request to turn it into an order in our lifecycle (staff
  // do the conversion in the portal), so it is gated by BOTH `approve_quotes` and
  // `convert_company_quotes_to_order`. `convert_quotes_to_order_require_approval` is
  // a RESTRICTION: when the role carries it, the acceptance is flagged for admin
  // approval rather than going straight through to an order.
  const perms = await getContactPermissions(session.contactId);
  if (perms.isB2B && !perms.can("approve_quotes")) {
    return {
      error: "Your role on this account doesn't allow approving quotes. Ask your account administrator to accept it.",
    };
  }
  if (perms.isB2B && !perms.can("convert_company_quotes_to_order")) {
    return {
      error: "Your role on this account doesn't allow converting quotes to orders. Ask your account administrator.",
    };
  }
  const requiresAdminApproval = perms.isB2B && perms.can("convert_quotes_to_order_require_approval");

  // Lifecycle method, NOT a bare status update: stamps accepted_at and writes
  // the quote.accepted audit row. The generic update() fired no side effects,
  // which is why acceptances used to be invisible to staff.
  // `markAccepted` is also the SINGLE sender of the "customer accepted a quote"
  // staff alert (it fires on every acceptance path, including the magic link and
  // the portal). The approval restriction is passed in so that one email still
  // tells staff the conversion needs sign-off — this action must NOT send its
  // own copy, or every configured recipient gets the acceptance twice.
  await quoteService.markAccepted(quoteId, { requiresAdminApproval });

  // Flag the acceptance so staff know this contact's conversions need sign-off
  // before the quote becomes an order. Best-effort — never fail the acceptance.
  if (requiresAdminApproval) {
    try {
      const attrs = (q.attributes ?? {}) as Record<string, unknown>;
      await quoteService.update(quoteId, {
        attributes: { ...attrs, requires_admin_approval: true },
      });
    } catch (e) {
      console.error("[acceptQuote] approval flag not stamped (non-fatal):", e);
    }
  }
  // Accepting WITHOUT paying sends the customer their pro-forma (Steve, card
  // 0Wy0xHuq: "when they accept without paying, they get sent a Quote to
  // Pro-Forma"). Paying instead goes through payQuote, which raises the real
  // order — so no pro-forma is sent on that path. Best-effort: a mail failure
  // must never undo an acceptance the customer has already made.
  try {
    const { sendQuoteProForma } = await import("@/lib/quotes/pro-forma-email");
    await sendQuoteProForma(
      { ...q, id: quoteId } as Record<string, unknown> & { id: number },
      (q.email as string | null) ?? session.email ?? null
    );
  } catch (e) {
    console.error("[acceptQuote] pro-forma email failed (non-fatal):", e);
  }

  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");
  return {
    success: true,
    ...(requiresAdminApproval
      ? {
          message:
            "Accepted — your role requires an administrator to approve the conversion, so we've sent it for approval.",
        }
      : {}),
  };
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
    | (QuoteRow & { status?: string | null; email?: string | null; items?: Array<Record<string, unknown>> })
    | null;
  if (!q || q.contact_id !== session.contactId || q.channel_id !== CHANNEL_ID) return { error: "Quote not found." };
  // A staff-only Draft is neither the customer's to SEE nor to COPY. The portal's
  // "Duplicate to Draft" carries contact_id onto the copy, so without this a
  // signed-in contact could duplicate an internal draft into a live quote of their
  // own — which then renders every negotiated line price straight back to them.
  // Deliberately the same "not found" a foreign quote gets: it must not confirm
  // the draft exists.
  if (isStaffOnlyDraft(q)) return { error: "Quote not found." };
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
    } catch { /* skip a failing line */ }
  }
  revalidatePath("/account/quotes");
  return { success: true, quoteId: copy.id };
}
