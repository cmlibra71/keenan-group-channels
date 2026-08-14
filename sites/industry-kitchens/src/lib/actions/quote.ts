"use server";

import { revalidatePath, refresh } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice } from "@/lib/store";
import { wantsStripeTestMode } from "@keenan/services";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { resolveCustomerRequestState } from "@keenan/services";
import {
  quoteHidesPrices,
  resolveQuoteAcceptState,
  isQuoteExpired,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { isStaffOnlyDraft, withoutStaffOnlyDrafts } from "@/lib/quotes/draft-visibility";
import {
  isCustomerEditableStatus,
  quoteAllowsItemEdits,
} from "@/lib/quotes/customer-editable";
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

// ── Customer edits their own quote (card FPfvaYLp) ───────────────────────────
//
// The emailed quote link has let a customer change a quantity or drop a line for
// a while; the logged-in account page had no way to touch a quote at all, which
// is what Tim reported on 11 Aug. Same edit, same rules, same single service
// entry point (`markChangeRequested`) as the emailed link, so the two surfaces
// cannot answer differently: a priced quote flips to "change request", re-hides
// its prices and emails the rep; an unpriced request or an already-open change
// request is simply recorded, so a customer can carry on editing — and put a
// quantity BACK.
//
// Adding NEW products stays with the rep (Zoey's customer edit is quantity and
// removal only) — the customer's route to more lines is Duplicate, or a call.

/** Every customer quote-edit action answers in exactly these two shapes. */
export type QuoteEditResult = { error: string } | { success: true };

type EditableQuote = QuoteRow & {
  status?: string | null;
  channel_id?: number;
  permissions?: Record<string, unknown> | null;
  items?: Array<{ id: number }>;
};

/**
 * Load the quote and refuse every reason a customer may not edit it. Editing is
 * limited to the quote's OWN contact — an account colleague with
 * `view_company_quotes` can read it, exactly as they can today, but changing
 * someone else's quote is not something Zoey offers either (and Accept is
 * already owner-only for the same reason).
 */
async function loadEditableQuote(
  quoteId: number
): Promise<{ error: string } | { quote: EditableQuote; contactId: number }> {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in." };

  // Per-customer budget: the stepper debounces, but a held-down button (or a
  // direct action call) must not be able to hammer the quote.
  if (!slidingWindowAllow(`quote-item-edit:${session.contactId}`, { windowMs: 60_000, max: 60 })) {
    return { error: "Too many changes just now — please wait a moment and try again." };
  }

  const quote = (await quoteService.getWithItems(quoteId)) as EditableQuote | null;
  // A staff-only draft answers "not found", the same as a stranger's quote —
  // saying "that's a draft" would confirm it exists.
  if (
    !quote ||
    isStaffOnlyDraft(quote) ||
    quote.channel_id !== CHANNEL_ID ||
    quote.contact_id !== session.contactId
  ) {
    return { error: "Quote not found." };
  }
  if (!isCustomerEditableStatus(quote.status)) {
    return { error: "This quote can no longer be changed. Please contact your sales rep." };
  }
  if (!quoteAllowsItemEdits(quote.permissions)) {
    return { error: "Changes to this quote need to go through your sales rep." };
  }
  return { quote, contactId: session.contactId };
}

/** Change the quantity on one line of the customer's own quote. */
export async function updateAccountQuoteItem(
  quoteId: number,
  itemId: number,
  quantity: number
): Promise<QuoteEditResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return { error: "Enter a quantity between 1 and 9999." };
  }
  const loaded = await loadEditableQuote(quoteId);
  if ("error" in loaded) return loaded;
  const { quote } = loaded;
  if (!(quote.items ?? []).some((i) => i.id === itemId)) return { error: "Item not on this quote." };

  try {
    await quoteItemService.updateForParent(quoteId, itemId, { quantity });
    // ONE entry point for the status flip, the audit line and the rep email.
    await quoteService.markChangeRequested(quoteId, { changeSummary: "Quantity changed" });
  } catch (e) {
    console.error("[updateAccountQuoteItem] failed:", e);
    return { error: "Could not update this quote." };
  }

  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");
  return { success: true };
}

/** Remove one line from the customer's own quote. */
export async function removeAccountQuoteItem(
  quoteId: number,
  itemId: number
): Promise<QuoteEditResult> {
  const loaded = await loadEditableQuote(quoteId);
  if ("error" in loaded) return loaded;
  const { quote } = loaded;
  if (!(quote.items ?? []).some((i) => i.id === itemId)) return { error: "Item not on this quote." };

  try {
    await quoteItemService.deleteForParent(quoteId, itemId);
    await quoteService.markChangeRequested(quoteId, { changeSummary: "Item removed" });
  } catch (e) {
    console.error("[removeAccountQuoteItem] failed:", e);
    return { error: "Could not remove that item." };
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

// ── Customer requests on a quote: more time, a change, a message ─────────────
// Card DIj4B7Gr (Steve 2026-08-07). The same three things the emailed /q/<uuid>
// link offers, so the signed-in page and the emailed link behave identically.

/**
 * Load the customer's OWN quote for a REQUEST (not an edit).
 *
 * Deliberately looser than {@link loadEditableQuote}: asking a question or
 * asking for more time is not editing, so it does not require
 * `allow_edit_items` or an editable status. Still owner-only, still
 * channel-scoped, still invisible for a staff-only draft, and still budgeted —
 * every one of these sends a staff email.
 */
async function loadOwnQuoteForRequest(
  quoteId: number
): Promise<{ error: string } | { quote: EditableQuote; contactId: number }> {
  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in." };

  // Tighter than the item-edit budget on purpose: a quantity stepper is clicked
  // dozens of times a minute by a real person, a message is not.
  if (!slidingWindowAllow(`quote-request:${session.contactId}`, { windowMs: 60_000, max: 10 })) {
    return { error: "You've sent several messages just now — please wait a moment." };
  }

  const quote = (await quoteService.getById(quoteId)) as EditableQuote | null;
  if (
    !quote ||
    isStaffOnlyDraft(quote) ||
    quote.channel_id !== CHANNEL_ID ||
    quote.contact_id !== session.contactId
  ) {
    return { error: "Quote not found." };
  }
  return { quote, contactId: session.contactId };
}

/** The three controls' availability, resolved from the quote the customer holds. */
async function requestStateFor(quote: EditableQuote) {
  return resolveCustomerRequestState({
    status: quote.status,
    hidesPrices: quoteHidesPrices(
      quote as { status?: string | null; hide_prices?: boolean | null },
      await getHidePriceStatuses()
    ),
    expiresAt: (quote.expires_at as string | null) ?? null,
  });
}

/**
 * "Can we have longer on this quote?" — emails the rep (else the storefront's
 * cs@ desk) and records the request on the quote.
 *
 * It does NOT move the expiry date: extension is not automated, the rep extends
 * by hand (Tim, 2026-08-07). Nothing about the quote changes.
 */
export async function requestMoreTime(quoteId: number, note?: string): Promise<QuoteEditResult> {
  const loaded = await loadOwnQuoteForRequest(quoteId);
  if ("error" in loaded) return loaded;
  const { quote, contactId } = loaded;

  const state = await requestStateFor(quote);
  if (!state.canRequestMoreTime) {
    return { error: "This quote can't take that request in its current state." };
  }

  try {
    await quoteService.recordCustomerRequest(quoteId, {
      kind: "more_time",
      note: note ?? null,
      authorContactId: contactId,
    });
  } catch (e) {
    console.error("[requestMoreTime] failed:", e);
    return { error: "Could not send that request." };
  }

  revalidatePath(`/account/quotes/${quoteId}`);
  return { success: true };
}

/**
 * "Please change something I can't change myself" — the delivery address,
 * freight, anything past the quantity/remove editing that already ships.
 *
 * Routes through the SHIPPED single entry point `markChangeRequested`, the same
 * one the quantity and remove edits use, so a change request behaves identically
 * however it was raised (cards FPfvaYLp / 5bZsm1MF). The delivery address stays
 * rep-only: the customer asks, the rep changes it.
 */
export async function requestQuoteChange(
  quoteId: number,
  message: string
): Promise<QuoteEditResult> {
  const text = (message ?? "").trim();
  if (!text) return { error: "Tell us what needs to change." };

  const loaded = await loadOwnQuoteForRequest(quoteId);
  if ("error" in loaded) return loaded;
  const { quote } = loaded;

  const state = await requestStateFor(quote);
  if (!state.canRequestChange) {
    return { error: "This quote can't take that request in its current state." };
  }

  try {
    await quoteService.markChangeRequested(quoteId, { changeSummary: text.slice(0, 1000) });
  } catch (e) {
    console.error("[requestQuoteChange] failed:", e);
    return { error: "Could not send that request." };
  }

  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");
  return { success: true };
}

/**
 * A message on the quote. Joins the same public thread the rep reads in the
 * portal, and emails them. Allowed on any quote the customer can see — including
 * one still being priced, which is exactly when they most want to ask.
 */
export async function postQuoteMessage(quoteId: number, body: string): Promise<QuoteEditResult> {
  const text = (body ?? "").trim();
  if (!text) return { error: "Please write a message first." };

  const loaded = await loadOwnQuoteForRequest(quoteId);
  if ("error" in loaded) return loaded;
  const { quote, contactId } = loaded;

  const state = await requestStateFor(quote);
  if (!state.canSendMessage) return { error: "Quote not found." };

  try {
    const result = await quoteService.recordCustomerRequest(quoteId, {
      kind: "message",
      note: text,
      authorContactId: contactId,
    });
    if (!result) return { error: "Please write a message first." };
  } catch (e) {
    console.error("[postQuoteMessage] failed:", e);
    return { error: "Could not send that message." };
  }

  revalidatePath(`/account/quotes/${quoteId}`);
  return { success: true };
}
