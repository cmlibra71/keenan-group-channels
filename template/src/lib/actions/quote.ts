"use server";

import { revalidatePath, refresh } from "next/cache";
import { quoteService, quoteItemService, productService, productVariantService, CHANNEL_ID, shouldSuppressCatalogSalePrice, getSiteConfig } from "@/lib/store";
import {
  wantsStripeTestMode,
  resolveChannelStaffNotificationRecipients,
  resolveEmailBranding,
  sendQuoteStaffNotificationEmail,
} from "@keenan/services";
import { getQuoteUuid, setQuoteUuid, clearQuoteUuid } from "@/lib/quote";
import { getSession } from "@/lib/auth";
import { layerCartPrice } from "@/lib/pricing/cart-pricing";
import {
  describeKitChoices,
  describeKitContents,
  readProductKit,
  resolveKitChoices,
  type KitChoice,
} from "@/lib/product-kit";
import {
  readProductAddons,
  resolveAddonSelection,
  describeAddonSelection,
  unansweredAddonGroups,
  type AddonSelectionInput,
} from "@keenan/services";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { resolveCustomerRequestState } from "@keenan/services";
import {
  quoteHidesPrices,
  resolveQuoteAcceptState,
  isQuoteExpired,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import {
  isCustomerEditableStatus,
  quoteAllowsItemEdits,
} from "@/lib/quotes/customer-editable";
import { isStaffOnlyDraft, withoutStaffOnlyDrafts } from "@/lib/quotes/draft-visibility";
import { acceptanceAcknowledgementUrl } from "@/lib/quotes/acknowledgement-url";
import { getContactPermissions } from "@/lib/role-permissions";
import { mayFileAddressInBook } from "@/lib/account/address-authority";
import { isProductVisibleToViewer, RESTRICTED_PRODUCT_ERROR } from "@/lib/catalog-scope";
import { contactService, customerAddressService } from "@/lib/store";
import { saveCheckoutAddressForContact } from "@/lib/contact-addresses";
import {
  QUOTE_REQUEST_PROBLEM_MESSAGE,
  mayFileQuoteAddressInBook,
  quoteAddressBookRow,
  quoteShippingAddressFromSaved,
  quoteShippingAddressSnapshot,
  validateQuoteRequest,
  type QuoteRequestForm,
  type SavedQuoteAddress,
} from "@/lib/quotes/quote-request";

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
  kitChoices?: KitChoice[] | null,
  /**
   * What the shopper configured on the page: ticked extras and typed answers, in
   * one bag (cards 0CDcCYmO + kyMjCmAw). Re-resolved SERVER-SIDE against this
   * product's own definition below, so a hand-made request can neither invent a
   * choice nor slip past a required one. Undefined means "this renderer offered
   * no panel" — leave whatever the line already carries alone.
   */
  addons?: AddonSelectionInput | null
) {
  // getById returns snake_case — read sale_price (reading salePrice was undefined,
  // so quotes silently used RRP instead of the catalog sale price).
  // Same visibility gate as the cart: a product restricted away from this shopper can't be quoted.
  if (!(await isProductVisibleToViewer(productId))) return { error: RESTRICTED_PRODUCT_ERROR };

  const product = await productService.getById(productId) as {
    price: string;
    sale_price: string | null;
    metafields?: unknown;
    restrict_add_to_quote?: boolean | null;
  } | null;
  if (!product) return { error: "Product not found" };

  // Zoey "Restrict Add to Quote" (card 7vu2iEEZ). The button is not offered for this product, so
  // reaching here means a stale page or a hand-posted action — refused HERE, as the cart refuses
  // its own restricted products, rather than trusting the page that drew the button.
  if (product.restrict_add_to_quote === true) {
    return { error: "This product can't be added to a quote. Please contact us about it." };
  }

  // ── Kit products (Zoey grouped / bundle, authored in the portal) ──────────────────────────
  // A BUNDLE is a modular configuration: it is not priced live, its picks come through as a
  // quote request (Steve, card 7bmpuqei). The choices arrive as group names + product ids and are
  // re-resolved against the product's OWN kit here, so nothing a browser sends can invent a line.
  // A GROUPED kit has no choices — its contents ride along so the rep can see what the one price
  // covers without opening the product.
  const kit = readProductKit(product.metafields);
  let lineAttributes: Record<string, unknown> | null = null;
  let lineNotes: string | null = null;
  if (kit?.kind === "bundle") {
    const resolved = resolveKitChoices(kit, kitChoices);
    if (!resolved) {
      return { error: "Choose an option in every group before adding this to a quote." };
    }
    lineAttributes = { kit_kind: "bundle", kit_selection: resolved };
    lineNotes = describeKitChoices(resolved);
  } else if (kit?.kind === "grouped") {
    lineAttributes = {
      kit_kind: "grouped",
      kit_contents: kit.items.map((i) => ({
        product_id: i.productId,
        sku: i.sku,
        name: i.name,
        quantity: i.quantity,
      })),
    };
    lineNotes = describeKitContents(kit);
  }

  // ── Customisation the shopper configured on the page ──────────────────────
  // Same re-resolution the kit build gets, and for the same reason: the client
  // states what was ticked or typed, never what it costs or whether it exists.
  // A `text` answer resolves at $0.00, so nothing here moves the line's money —
  // it is a record of what the customer asked for, which the rep prices on review.
  const productAddons = readProductAddons(product.metafields);
  const resolvedAddons = addons === undefined ? null : resolveAddonSelection(productAddons, addons);
  if (resolvedAddons) {
    // The page makes this refusal too, so reaching it means a stale tab or a
    // hand-posted action. Worded, never silent — the customer has to be able to
    // tell what is missing (`sf-product-page`, 7vu2iEEZ + CXnP1lrL).
    const unanswered = unansweredAddonGroups(productAddons, addons);
    if (unanswered.length > 0) {
      return {
        error: `Please fill in ${unanswered.join(" and ")} before adding this to your quote.`,
      };
    }
    if (resolvedAddons.length > 0) {
      // MERGED into the bag, never over it: `quote_items.attributes` has other
      // owners (see docs/behaviour/quotes.md > quote-editor).
      lineAttributes = { ...(lineAttributes ?? {}), addon_selection: resolvedAddons };
      const addonNote = describeAddonSelection(resolvedAddons);
      // NO MONEY in this note — it prints to the CUSTOMER on /q/<uuid>, outside
      // the hide-prices gate. `describeAddonSelection` is what guarantees that.
      lineNotes = [lineNotes, addonNote].filter(Boolean).join("\n") || null;
    } else if (lineAttributes === null) {
      // A deliberate clear-down: the shopper emptied the box and pressed the
      // button again, so the line's configuration goes with it.
      lineAttributes = {};
      lineNotes = null;
    }
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

  // Pre-link quote to the contact if logged in. Best-effort convenience only — it
  // must never block adding the item. A stale/invalid session (e.g. a deleted
  // contact) would otherwise throw an FK ValidationError and 500 the whole
  // add-to-quote, leaving the quote empty with no feedback.
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
    attributes?: Record<string, unknown> | null;
  } | null;

  if (existing) {
    // A quote may hold only ONE line per product+variant, so re-configuring a bundle REPLACES the
    // captured configuration on the line the customer already has (and does not stack a second
    // quantity onto a different build). Everything else keeps counting up as before.
    //
    // A re-typed INSTRUCTION is the same event (card kyMjCmAw): a shopper who changes "1200mm
    // bench" to "800mm bench" and presses the button again is correcting the request, not
    // ordering a second bench — stacking would leave the rep one line, quantity 2, and only the
    // newer set of measurements. A custom fabrication is not a countable stock item.
    const reconfigured =
      (kit?.kind === "bundle" || (resolvedAddons?.length ?? 0) > 0) &&
      lineNotes !== existing.customer_notes;
    await quoteItemService.updateForParent(quote.id, existing.id, {
      quantity: reconfigured ? existing.quantity : existing.quantity + 1,
      // MERGED into the bag, never over it. `quote_items.attributes` is replaced
      // WHOLESALE on write and has several owners — a rep's `indent` tick, a
      // `custom_line` marker, `zoey_item_id` on 62,351 ingested rows — so a
      // wholesale write here takes a rep's indent tick off a quote the customer is
      // already reading (docs/behaviour/quotes.md > quote-editor).
      ...(lineAttributes
        ? {
            attributes: { ...(existing.attributes ?? {}), ...lineAttributes },
            customerNotes: lineNotes,
          }
        : {}),
    });
  } else {
    await quoteItemService.createForParent(quote.id, {
      productId,
      variantId: variantId || null,
      quantity: 1,
      listPrice,
      salePrice,
      // WHO PUT THIS PRICE HERE: the customer did, off the catalogue, through
      // `layerCartPrice` above. `price_source` is what decides whether a line is
      // ever repriced again, and its old default said `manual` — a price a sales
      // manager typed, which is never re-derived — so a customer's own line was
      // frozen at the price it was added at for life (card laFQveZT). Say it out
      // loud here; the service will not guess it for us.
      priceSource: "customer",
      ...(lineAttributes ? { attributes: lineAttributes, customerNotes: lineNotes } : {}),
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

/**
 * Who is signed in, for the delivery address's "ask for" name. Best effort: a lookup
 * that fails costs a name on the address, never the quote request.
 */
async function contactName(contactId: number): Promise<{ firstName: string; lastName: string }> {
  try {
    const c = (await contactService.getById(contactId)) as Record<string, unknown> | null;
    return {
      firstName: ((c?.first_name as string) ?? "").trim(),
      lastName: ((c?.last_name as string) ?? "").trim(),
    };
  } catch {
    return { firstName: "", lastName: "" };
  }
}

/**
 * The customer's saved delivery addresses, for the quote request form's dropdown.
 *
 * Same read the checkout uses (`listForContact` also covers legacy customer-keyed
 * rows through the migration's contact_id backfill), reduced to the fields the
 * dropdown and the snapshot need — a whole-row read would ship the default flags and
 * timestamps into a client component for no reason.
 */
export async function getQuoteDeliveryAddresses(): Promise<SavedQuoteAddress[]> {
  const session = await getSession();
  if (!session) return [];
  try {
    const rows = (await customerAddressService.listForContact(session.contactId)) as Record<
      string,
      unknown
    >[];
    return rows.slice(0, 20).map((a) => ({
      id: a.id as number,
      firstName: (a.first_name ?? "") as string,
      lastName: (a.last_name ?? "") as string,
      company: (a.company ?? "") as string,
      phone: (a.phone ?? "") as string,
      address1: (a.address1 ?? "") as string,
      address2: (a.address2 ?? "") as string,
      city: (a.city ?? "") as string,
      stateOrProvince: (a.state_or_province ?? "") as string,
      postalCode: (a.postal_code ?? "") as string,
      country: (a.country ?? "") as string,
      countryCode: (a.country_code ?? "AU") as string,
    }));
  } catch (e) {
    // No address book is a normal state (a brand-new customer). The form falls back
    // to "enter a new address", which is the only option they had anyway.
    console.error("[getQuoteDeliveryAddresses] read failed (non-fatal):", e);
    return [];
  }
}

/**
 * May THIS customer's typed address be filed in their address book?
 *
 * The checkout's rule, unchanged: a B2B contact whose role forbids adding an address
 * does not get one saved, and because one saved address can become the contact's
 * default BILLING as well as shipping (the first one always does), it takes BOTH
 * checkout codes — exactly as `placeOrder` does on the single-page checkout — and,
 * since card H5JdsMrC, the address book's own main-contact-only add codes too. It is
 * asked here so the drawer can stop PRINTING a promise we then quietly do not keep.
 *
 * Fails open on a lookup error, like every other role read on a customer path: the
 * worst case is an address saved for someone who could have added one anyway.
 */
// ONE name for the ROLE rule: `mayFileAddressInBook` (lib/account/address-authority.ts),
// shared with `placeOrder` and the address book so the three writers into that
// table cannot drift apart. The local `mayFileAddressForRole` alias is gone — two
// names for one predicate is how a register entry comes to describe a rule nobody
// can find. (`mayFileQuoteAddressInBook`, further down, is a different question
// entirely: the AU-country test on the address itself.)

export async function canSaveQuoteAddress(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  try {
    return mayFileAddressInBook(await getContactPermissions(session.contactId));
  } catch (e) {
    console.error("[canSaveQuoteAddress] role read failed (non-fatal):", e);
    return true;
  }
}

/**
 * Send the quote request (card 9tbz3sBF).
 *
 * Zoey's own form asks for a Quote Name (required), Quote Comments and a Delivery
 * Address, and so do we. The rules are `validateQuoteRequest`, applied HERE as well
 * as on the button: the action is callable directly, and a stale tab must not be
 * able to file a nameless, address-less request that a rep then has to chase.
 *
 * The address is snapshotted onto `quotes.shipping_address` rather than looked up
 * later, because a quote's Ship-To is its own frozen copy (card iJfNIFn9) — the
 * customer editing their address book next month must not silently redirect a quote
 * already with a rep. A newly typed address is also filed in the address book, which
 * is Steve's "yes we should also save that address".
 */
export async function submitQuote(form: QuoteRequestForm) {
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

  // The saved addresses are re-read on the server: the posted id is checked against
  // what this contact ACTUALLY has, so a tampered form cannot attach someone else's
  // address to a quote.
  const savedAddresses = await getQuoteDeliveryAddresses();
  // The SAME rules the button applied, including the Australian state and postcode
  // rules the checkout enforces (cards 18PbOwaG / xqWftDcL) — this action writes the
  // quote's Ship-To, which becomes the order's Ship-To, which is where freight is
  // priced, so a free-text "Victoria" or a 5-digit postcode is refused here too.
  const problem = validateQuoteRequest(form, savedAddresses);
  if (problem) return { error: QUOTE_REQUEST_PROBLEM_MESSAGE[problem] };

  const chosen = form.addressId === "new" ? null : savedAddresses.find((a) => a.id === form.addressId);
  // A blank name on a delivery address reads as nobody to ask for on site, so it falls
  // back to whoever is signed in. Only read when a NEW address is being typed.
  const signedInName = chosen
    ? { firstName: "", lastName: "" }
    : await contactName(session.contactId);
  const newAddress = chosen
    ? null
    : {
        ...form.newAddress,
        firstName: form.newAddress.firstName.trim() || signedInName.firstName,
        lastName: form.newAddress.lastName.trim() || signedInName.lastName,
      };
  const shippingAddress = chosen
    ? quoteShippingAddressFromSaved(chosen)
    : quoteShippingAddressSnapshot(newAddress!);

  // Attach customer identity, the name, their comment and the delivery address. The
  // quote stays in `quote_pending` (Zoey lifecycle): the sales team reviews it in the
  // portal and sends pricing back via markSent → quote_available. The submitted_at
  // attribute distinguishes a customer-submitted request from an in-progress draft
  // (both share the quote_pending status) and is what LOCKS the request — the panel
  // starts a fresh quote afterwards, so there is nothing left to edit (Steve: address
  // changes after submission are by phone or email).
  const existingAttributes = (quote.attributes ?? {}) as Record<string, unknown>;
  await quoteService.update(quote.id, {
    contactId: session.contactId,
    email: session.email,
    quoteName: form.quoteName.trim(),
    customerNotes: form.comments.trim() || null,
    shippingAddress,
    attributes: { ...existingAttributes, submitted_at: new Date().toISOString() },
  });

  // File a newly typed address for next time. Wrapped whole: a request that reached
  // the sales team must never fail because the address book could not be updated.
  //
  // Two gates, both the checkout's own, both stated on the drawer so we never print a
  // promise we do not keep:
  //  * the B2B role — BOTH `add_shipping_address_in_checkout` and
  //    `add_billing_address_in_checkout`, because the first address a contact saves
  //    becomes their default BILLING as well as shipping (`defaultsForNewAddress`);
  //  * the country — the address book is AU only (`sf-checkout`, cards 18PbOwaG /
  //    xqWftDcL), so a NZ delivery address is used for this quote and not filed.
  //
  // What is filed is `quoteAddressBookRow`, i.e. the NORMALISED state, so the saved
  // row and the quote's Ship-To carry the same value and neither is chipped
  // "Needs details" the next time the customer reaches the checkout.
  if (newAddress) {
    try {
      if (mayFileAddressInBook(perms) && mayFileQuoteAddressInBook(newAddress)) {
        await saveCheckoutAddressForContact(
          session.contactId,
          quoteAddressBookRow({ ...newAddress, country: String(shippingAddress.country ?? "") })
        );
      }
    } catch (e) {
      console.error("[submitQuote] address book save failed (non-fatal):", e);
    }
  }

  await clearQuoteUuid();

  refresh(); // acting user's view refreshes; shared data cache stays intact
  return { success: true };
}

export async function getQuotesForCustomer() {
  const session = await getSession();
  if (!session) return { error: "Not logged in", quotes: [] };

  // Contact-keyed (identity unification). Mirrors the old listForCustomer
  // semantics: this channel's quotes for the subject, hiding the in-progress
  // basket-shaped draft (quote_pending, never submitted), newest first.
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
  //
  // A SUBMITTED request is kept even though it is still `quote_pending`: the customer
  // has just named it, been told "You can track your quotes in My Account" and handed
  // a "View My Quotes" button (card 9tbz3sBF), so the quote they named has to be in
  // the list. `attributes.submitted_at` is what `submitQuote` stamps and is the only
  // thing separating a sent request from the basket-shaped draft the panel is holding.
  // Same rule as the /account/quotes page — the two must not disagree.
  const contactQuotes = withoutStaffOnlyDrafts(
    (
      result.data as Array<{
        status?: string | null;
        attributes?: { submitted_at?: unknown } | null;
      }>
    ).filter((q) => q.status !== "quote_pending" || Boolean(q.attributes?.submitted_at))
  );
  return { quotes: contactQuotes };
}

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
  // `suppressStaffAlert`: the portal follow-up called below is the one sender of
  // the acceptance email. Without it the service sends its own older alert too
  // and every configured inbox gets two.
  await quoteService.markAccepted(quoteId, { requiresAdminApproval, suppressStaffAlert: true });

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

  // Everything that happens after an acceptance — the rep's email with the quote
  // PDF, the customer's confirmation, and the two freight gates that decide
  // whether this becomes an order (card 9XRQmaiz) — is ONE place, and that place
  // is in the portal: it draws the PDF and the order from the portal's own quote
  // money view, and a second copy of that arithmetic here would be a second
  // place for a quote's money to be wrong. So the storefront asks the portal to
  // run it, rather than behaving differently from the emailed quote link.
  //
  // Best-effort and never fatal: the customer has already been told their
  // acceptance succeeded. The endpoint is idempotent, so a retry is safe.
  //
  // `customerAlreadyNotified` matters: this path has just sent the customer
  // their pro-forma (card 0Wy0xHuq), which IS their acceptance confirmation.
  // Without the flag they would get a second email about the same event, and a
  // person gets ONE email per order (Product Brief).
  //
  // `suppressConversion` matters MORE. On THIS path the customer has just been
  // emailed a pro-forma whose button is "Pay this quote" and which points back
  // at this page. `converted_to_order` is a terminal pay state here
  // (`quote-payable.ts`, card 0Wy0xHuq: accepting without paying leaves the
  // money owed and the pro-forma exists to be paid), and neither storefront has
  // an order-payment page. So converting the quote in the same request that
  // emailed that button would hide the button and leave the customer with no way
  // to pay at all. The order on this path is raised by the PAYMENT (`payQuote`),
  // which is Tim's "accepting goes straight to payment" — the freight gates are
  // still evaluated and the rep is still told where it stands.
  const followUpRan = await runPortalAcceptanceFollowUp(q.uuid, {
    customerAlreadyNotified: true,
    suppressConversion: true,
  });
  // The follow-up is the ONE sender of the acceptance email, and `markAccepted`
  // was told to stay quiet on that basis. If the portal could not be reached —
  // most plausibly a deploy that put this build out ahead of the portal's — the
  // acceptance would otherwise go completely unannounced, which is the one
  // outcome worse than a duplicate. Fall back to the older per-site alert.
  if (!followUpRan) await sendFallbackAcceptanceAlert(quoteId, q, requiresAdminApproval);

  revalidatePath(`/account/quotes/${quoteId}`);
  revalidatePath("/account/quotes");

  // This storefront's own site row, for the acknowledgement host below. Cached
  // per request and best-effort: an acceptance that has already succeeded must
  // never fail because we could not read a URL, and a null simply falls back.
  const { site } = await getSiteConfig().catch(() => ({ site: null }));

  return {
    success: true,
    // Where the customer is sent now that the acceptance is done (card 87IkgD2H,
    // Tim 2026-08-19). It is the PORTAL's acknowledgement page — the same one the
    // emailed quote link lands on — and it is one page rather than two on purpose:
    // it carries the SilverChef offer, and that figure is computed once in the
    // portal's shared finance module. Re-building it here would mean a second rent
    // calculation on a storefront that cannot reach that module, which is the very
    // gap `sf-account-quotes` records rather than papering over.
    //
    // `from=account` says the reader is signed in HERE, which is the only thing it
    // decides: the countdown goes to this storefront's /account rather than its
    // front page, and the wording names the pro-forma this path has just emailed.
    // Nothing is unlocked by it — the quote's uuid is the credential, exactly as
    // it is for the emailed link.
    acknowledgementUrl: acceptanceAcknowledgementUrl(q.uuid, site),
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
        // The copy keeps the original line's provenance, and a line with none
        // recorded is the customer's own (card laFQveZT).
        priceSource: (it.price_source as string) || "customer",
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
  const { quote, contactId } = loaded;

  const state = await requestStateFor(quote);
  if (!state.canRequestChange) {
    return { error: "This quote can't take that request in its current state." };
  }

  try {
    // `changeSummary` is the line in the rep's email; `customerNote` is what
    // gets written ONTO the quote, so the rep who opens it reads the request
    // itself rather than a bare "Change requested".
    await quoteService.markChangeRequested(quoteId, {
      changeSummary: text.slice(0, 1000),
      customerNote: text.slice(0, 1000),
      authorContactId: contactId,
    });
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

/**
 * Ask the portal to run the acceptance follow-up for a quote we have just
 * accepted (card 9XRQmaiz). The quote's own uuid is the credential — the same
 * unguessable token this customer used to reach the quote — and the endpoint
 * only ever acts on a quote that is ALREADY accepted, so it grants no authority
 * the caller did not have.
 *
 * Never throws and never blocks: the acceptance itself has already succeeded.
 * Returns whether the portal actually ran it, so the caller can fall back to the
 * older alert rather than leave an acceptance unannounced.
 *
 * NOTE ON RATE LIMITING: this is a server-to-server call, so every storefront
 * acceptance shares ONE source IP against the portal's `quote_link_action`
 * per-IP budget (60 per 15 minutes). Comfortable at today's volume — a handful
 * of acceptances a day — but it is the number to raise first if acceptances ever
 * start being refused.
 */
async function runPortalAcceptanceFollowUp(
  uuid: string | null | undefined,
  options: { customerAlreadyNotified?: boolean; suppressConversion?: boolean } = {}
): Promise<boolean> {
  if (!uuid) return false;
  const base = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/q/${encodeURIComponent(uuid)}/accepted-followup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_already_notified: options.customerAlreadyNotified === true,
        suppress_conversion: options.suppressConversion === true,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[acceptQuote] portal follow-up returned ${res.status} for quote ${uuid}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[acceptQuote] portal follow-up failed (non-fatal):", error);
    return false;
  }
}

/**
 * The pre-9XRQmaiz staff alert, sent ONLY when the portal follow-up could not
 * run. It is the same message `markAccepted` used to send and the same recipient
 * list, so nothing is invented here — it exists so that the ordering of a deploy
 * can never make an acceptance silent. Never throws.
 */
async function sendFallbackAcceptanceAlert(
  quoteId: number,
  quote: Record<string, unknown>,
  requiresAdminApproval: boolean
): Promise<void> {
  try {
    const recipients = await resolveChannelStaffNotificationRecipients(CHANNEL_ID, {
      envFallback: process.env.QUOTE_NOTIFICATION_EMAIL,
    });
    if (recipients.length === 0) return;
    const portalBase = (process.env.PORTAL_BASE_URL || "https://keenan-group.com.au").replace(/\/$/, "");
    const attrs = (quote.attributes ?? {}) as Record<string, unknown>;
    await sendQuoteStaffNotificationEmail({
      to: recipients,
      event: "accepted",
      quoteNumber: String(quote.quote_number ?? `#${quoteId}`),
      quoteUrl: `${portalBase}/dashboard/quotes/${quoteId}`,
      customerEmail: (quote.email as string | null) ?? null,
      total: quote.quote_amount != null ? String(quote.quote_amount) : null,
      currency: (quote.currency_code as string) || "AUD",
      quoteName: (quote.quote_name as string | null) ?? null,
      requiresAdminApproval,
      branding: await resolveEmailBranding(CHANNEL_ID).catch(() => undefined),
      testMode: attrs.test_mode === true,
    });
  } catch (error) {
    console.error("[acceptQuote] fallback acceptance alert failed (non-fatal):", error);
  }
}
