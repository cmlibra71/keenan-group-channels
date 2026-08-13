import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import {
  quoteService,
  productImageService,
  customerAddressService,
  getCheckoutSettings,
  CHANNEL_ID,
} from "@/lib/store";
import { Price } from "@/components/ui/Price";
import { QuoteActions } from "./quote-actions";
import {
  quoteHidesPrices,
  redactQuotePrices,
  resolveQuoteAcceptState,
  resolveQuoteTotal,
} from "@/lib/quotes/price-visibility";
import { getHidePriceStatuses } from "@/lib/quotes/hide-price-statuses";
import { isStaffOnlyDraft } from "@/lib/quotes/draft-visibility";
import { quoteGstTotals, isMoneyRow } from "@/lib/quotes/quote-gst";
import { resolveQuoteGstRate } from "@/lib/quotes/quote-gst-rate";
import { quoteStatusLabel } from "@/lib/quotes/quote-status-label";
import {
  isCustomerEditableStatus,
  quoteAllowsItemEdits,
} from "@/lib/quotes/customer-editable";
import { QuoteItemControls } from "./quote-item-controls";
import { readQuoteDeposit, resolveQuoteDeposit, depositLabel } from "@/lib/quotes/quote-deposit";
import { resolveQuotePayState } from "@/lib/quotes/quote-payable";
import { QuotePayPanel, type PayMethod } from "./quote-pay-panel";
import { resolveAccountOptions } from "@/lib/checkout/account-options";
import { filterPaymentMethodsForAccount } from "@/lib/checkout/account-options-policy";
import { isFinancePaymentMethod } from "@/lib/checkout/finance";
import { resolveNetTermsEntitlement } from "@/lib/checkout/net-terms";
import { resolveStripeGateway } from "@/lib/payments/gateway";
import { AccountShell } from "@/components/account/AccountShell";

/** en-AU money, matching the <Price> component's formatting. */
function formatMoney(amount: number, currency: string | null): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency || "AUD",
  }).format(amount);
}

// QuoteService returns snake_case rows (transformRow convention).
interface QuoteDetail {
  id: number;
  uuid: string;
  status: string | null;
  channel_id: number;
  contact_id: number | null;
  quote_number: string | null;
  quote_amount: string | null;
  // Basis of the stored total (a Zoey-ingested total already includes GST) plus
  // every component that reconciles to it — see quoteGstTotals.
  tax_inclusive: boolean | null;
  external_source: string | null;
  tax_class_id: number | null;
  discount_amount: string | null;
  coupon_discount: string | null;
  gift_certificate_amount: string | null;
  store_credit_amount: string | null;
  shipping_cost: string | null;
  base_amount: string | null;
  customer_notes: string | null;
  currency_code: string | null;
  attributes: Record<string, unknown> | null;
  shipping_address: Record<string, string | null> | null;
  hide_prices: boolean | null;
  /** Customer-permission bag (allow_edit_items etc.), seeded from quote settings. */
  permissions: Record<string, unknown> | null;
  expires_at: Date | string | null;
  created_at: Date | string | null;
  items: QuoteDetailItem[];
}

interface QuoteDetailItem {
  id: number;
  product_id: number;
  quantity: number;
  list_price: string | null;
  sale_price: string | null;
  product_name: string;
  product_slug: string | null;
  product_sku: string | null;
  variant_sku: string | null;
  variant_option_name: string | null;
}

const statusStyles: Record<string, string> = {
  quote_pending: "bg-yellow-100 text-yellow-700",
  quote_available: "bg-blue-100 text-blue-700",
  open_change_request: "bg-blue-100 text-blue-700",
  quote_accepted: "bg-green-100 text-green-700",
  quote_on_hold: "bg-zinc-100 text-zinc-600",
  converted_to_order: "bg-green-100 text-green-700",
  quote_expired: "bg-zinc-100 text-zinc-600",
  quote_cancelled: "bg-red-100 text-red-700",
};


export const metadata = {
  title: "Quote",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Read the id first — purely syntactic, so it discloses nothing ahead of the
  // session guard, and the guard needs it to send the customer back here.
  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (Number.isNaN(quoteId)) notFound();

  // A quote notification link always arrives session-less: carry the destination
  // so signing in lands the customer back on THIS quote.
  const session = await getSession();
  if (!session) redirect(signInRedirect(`/account/quotes/${quoteId}`));

  const raw = (await quoteService.getWithItems(quoteId)) as QuoteDetail | null;
  // Only the owning contact, on this channel, may view a quote.
  // Only the owning contact, on this channel, may view a quote — UNLESS their B2B
  // account role grants `view_company_quotes`, in which case any quote belonging to
  // an active member of their account is visible (docs/crm-parity/10-role-enforcement.md).
  if (!raw || raw.channel_id !== CHANNEL_ID) notFound();
  // A staff-only Draft is "not found" for everyone on the storefront — including
  // an account-wide viewer, so this sits ABOVE the view_company_quotes branch. Same
  // answer a stranger's quote gets: confirming the draft exists is itself a leak.
  if (isStaffOnlyDraft(raw)) notFound();
  const isOwnQuote = raw.contact_id === session.contactId;
  if (!isOwnQuote) {
    const perms = await getContactPermissions(session.contactId);
    const canSeeAccountQuotes =
      perms.isB2B && perms.accountId !== null && perms.can("view_company_quotes");
    const memberIds = canSeeAccountQuotes ? await getAccountContactIds(perms.accountId!) : [];
    if (!raw.contact_id || !memberIds.includes(raw.contact_id)) notFound();
  }

  const status = raw.status || "quote_pending";
  // Price visibility is the quote's own hide_prices value, falling back to the
  // portal-configured price-hiding statuses only when that column is null.
  const hidePrices = quoteHidesPrices(raw, await getHidePriceStatuses());
  // Strip the numbers server-side when they're hidden: rendering around them still
  // ships the raw prices in the page source / RSC payload.
  const quote = hidePrices ? redactQuotePrices(raw) : raw;
  const acceptState = resolveQuoteAcceptState({
    status,
    hidesPrices: hidePrices,
    expires_at: raw.expires_at,
  });
  // The customer may change quantities and drop lines on their own live quote —
  // before we have priced it AND after — exactly as they can on the emailed
  // quote link (cards FPfvaYLp / 5bZsm1MF). A colleague reading the quote under
  // `view_company_quotes` may look but not change, the same rule Accept uses.
  const itemsEditable =
    isOwnQuote && isCustomerEditableStatus(status) && quoteAllowsItemEdits(raw.permissions);

  // Item thumbnails (quote items don't carry images themselves).
  const productIds = [...new Set(quote.items.map((i) => i.product_id))];
  const thumbs = (await productImageService.getThumbnailsForProducts(productIds)) as {
    product_id: number;
    url_thumbnail: string | null;
    url_standard: string | null;
  }[];
  const thumbByProduct = new Map(
    thumbs.map((t) => [t.product_id, t.url_thumbnail || t.url_standard])
  );

  // Show the real total whenever prices are visible — including $0.00 — but not a
  // stale zero on a quote whose lines carry money. See resolveQuoteTotal.
  const total = resolveQuoteTotal(quote);
  // The quote total is the amount payable, so GST is broken out rather than left
  // implicit — the same split the cart summary and the emailed quote show, at the
  // same per-quote rate the portal resolves.
  const gst = quoteGstTotals(total ?? 0, quote, await resolveQuoteGstRate(raw.tax_class_id));
  // ── Paying this quote (card 0Wy0xHuq) ────────────────────────────────────
  // The rep may have set a deposit on the quote; that is what the customer is
  // charged now, with the balance following. Both figures are GST-INCLUSIVE,
  // because that is the money the customer actually pays.
  const deposit = hidePrices
    ? null
    : resolveQuoteDeposit(readQuoteDeposit(raw.attributes), gst.incTax);
  const amountDue = deposit ? deposit.due_now : Math.round(gst.incTax * 100) / 100;

  // Payment methods are read EXACTLY as checkout reads them — the channel's
  // customer-facing list (enabled, minus channel staff-only), narrowed by the
  // account's allow-list AND minus the methods the ACCOUNT marks staff-only,
  // with net terms only for an entitled account. This is a customer surface like
  // the checkout, so both staff-only controls apply here too. Switch card
  // payments on later and they appear here with no further work.
  //
  // EXCEPT the equipment-finance methods (card VAjaPj0t). SilverChef and Finance
  // are not a way of paying: they place an order UNPAID against an application
  // form, behind a $1,000 inc-GST floor, with a weekly figure on the button and
  // the rep notified. None of that is built on this screen, and paying a quote
  // has its own money rules (deposit, GST-inclusive amount due — cards 0Wy0xHuq,
  // Sh03niVC). Enabling them for the checkout must not make a bare "SilverChef"
  // button appear here that converts the quote to an order and charges nothing.
  const [checkoutSettings, accountOptions, netTerms] = await Promise.all([
    getCheckoutSettings(),
    resolveAccountOptions(session),
    resolveNetTermsEntitlement(session),
  ]);
  const payMethods: PayMethod[] = filterPaymentMethodsForAccount(
    checkoutSettings.customerPaymentMethods.filter((m) => !isFinancePaymentMethod(m.id)),
    accountOptions?.allowedPaymentMethods ?? null,
    accountOptions?.staffOnlyPaymentMethods ?? null
  )
    .filter((m) => m.id !== "net_terms" || !!netTerms)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      bankDetails: m.bankDetails,
      netTermsDays: m.id === "net_terms" && netTerms ? netTerms.netTermsDays : m.netTermsDays,
    }));

  // Delivery address. The quote's own agreed address is shown read-only — staff
  // can change it, customers can't (Steve, 2026-08-07). Only a quote that never
  // carried one falls back to the customer's saved addresses.
  const quoteShip = (raw.shipping_address ?? null) as Record<string, string | null> | null;
  const quoteHasShipTo = !!quoteShip && Object.values(quoteShip).some((v) => v);
  const addressSummary = quoteHasShipTo
    ? [
        quoteShip!.street1 ?? quoteShip!.address1,
        quoteShip!.street2 ?? quoteShip!.address2,
        quoteShip!.city,
        quoteShip!.region ?? quoteShip!.state_or_province,
        quoteShip!.postcode ?? quoteShip!.postal_code,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  let addressOptions: { id: number; label: string }[] = [];
  if (!quoteHasShipTo) {
    try {
      const rows = (await customerAddressService.listForContact(session.contactId)) as Record<
        string,
        unknown
      >[];
      addressOptions = rows.slice(0, 20).map((a) => ({
        id: a.id as number,
        label: [a.address1, a.city, a.state_or_province, a.postal_code]
          .filter(Boolean)
          .join(", "),
      }));
    } catch {
      /* no saved addresses — the pay gate greys the button with the reason */
    }
  }

  const payState = resolveQuotePayState({
    status,
    hidesPrices: hidePrices,
    expiresAt: raw.expires_at,
    items: raw.items,
    amountDue,
    paymentMethodCount: payMethods.length,
    hasDeliveryAddress: quoteHasShipTo || addressOptions.length > 0,
  });
  const { gateway: stripeGateway } = await resolveStripeGateway();
  const freightPending = !isMoneyRow(gst.freightEx);


  return (
    <AccountShell>
      <Link
        href="/account/quotes"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mb-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to My Quotes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold text-zinc-900">
          Quote #{quote.quote_number || quote.id}
        </h1>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            statusStyles[status] || "bg-zinc-100 text-zinc-600"
          }`}
        >
          {quoteStatusLabel(status)}
        </span>
      </div>
      <p className="text-sm text-zinc-500 mb-8">
        {quote.created_at ? `Requested ${new Date(quote.created_at).toLocaleDateString()}` : ""}
        {quote.expires_at ? ` · Valid until ${new Date(quote.expires_at).toLocaleDateString()}` : ""}
      </p>

      {hidePrices && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {status === "open_change_request"
            ? "Your changes have been received — we'll re-quote shortly."
            : "Our sales team is preparing pricing for this quote. We'll let you know as soon as it's ready."}
        </div>
      )}

      {itemsEditable && (
        <p className="mb-4 text-sm text-zinc-500">
          {status === "quote_available"
            ? "Need a different quantity? Change it below — we'll re-price the quote and send it back to you."
            : "You can still change quantities or remove items below."}
        </p>
      )}

      {/* Items */}
      <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-200">
        {quote.items.map((item) => {
          const unitPrice = item.sale_price
            ? parseFloat(item.sale_price)
            : parseFloat(item.list_price ?? "");
          // $0.00 IS a price — a line someone deliberately zeroed reads like every
          // other line. Only a missing/unparsable number counts as "no price".
          const hasPrice = Number.isFinite(unitPrice);
          return (
            <div key={item.id} className="p-4 flex items-center gap-4">
              <div className="relative h-16 w-16 flex-shrink-0 rounded border border-zinc-200 bg-white overflow-hidden">
                {thumbByProduct.get(item.product_id) ? (
                  <Image
                    src={thumbByProduct.get(item.product_id)!}
                    alt={item.product_name}
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-300">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={item.product_slug ? `/products/${item.product_slug}` : "#"}
                  className="text-sm font-medium text-zinc-900 hover:underline block"
                >
                  {item.product_name}
                </a>
                {item.variant_option_name && (
                  <p className="text-xs text-zinc-500 mt-0.5">{item.variant_option_name}</p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  SKU: {item.variant_sku || item.product_sku || "N/A"}
                </p>
                <p className="text-sm text-zinc-600 mt-1">
                  Qty {item.quantity}
                  {!hidePrices && hasPrice && (
                    <>
                      {" · "}
                      <Price amount={unitPrice} /> each
                    </>
                  )}
                </p>
                {itemsEditable && (
                  <QuoteItemControls
                    quoteId={quote.id}
                    itemId={item.id}
                    quantity={item.quantity}
                  />
                )}
                {/* "Requires quote" is reserved for a quote whose pricing hasn't
                    been prepared yet — never for a priced line that happens to
                    come to $0.00. */}
                {hidePrices && (
                  <span className="mt-1 inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">
                    Requires quote
                  </span>
                )}
              </div>
              {!hidePrices && hasPrice && (
                <div className="text-right">
                  <Price
                    amount={unitPrice * item.quantity}
                    className="text-sm font-semibold text-zinc-900"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals — GST shown, because the quote total is what the customer pays.
          Every non-zero component is printed, so Subtotal … Total is arithmetic the
          customer can follow — including the freight Zoey folds into its grand total
          with no shipping_cost of its own. */}
      <div className="mt-4 border-t border-zinc-200 pt-4">
        {!hidePrices && total !== null ? (
          <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-zinc-600">Subtotal (ex GST)</dt>
              <dd><Price amount={gst.subtotalEx} className="text-zinc-900" /></dd>
            </div>
            {(
              [
                ["Discount", gst.discountEx],
                ["Coupon", gst.couponEx],
                ["Gift certificate", gst.giftEx],
                ["Store credit", gst.creditEx],
              ] as const
            )
              .filter(([, amount]) => isMoneyRow(amount))
              .map(([label, amount]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-zinc-600">{label}</dt>
                  <dd className="text-zinc-900">
                    −<Price amount={amount} className="text-zinc-900" />
                  </dd>
                </div>
              ))}
            {isMoneyRow(gst.freightEx) && (
              <div className="flex items-center justify-between">
                <dt className="text-zinc-600">Freight (ex GST)</dt>
                <dd><Price amount={gst.freightEx} className="text-zinc-900" /></dd>
              </div>
            )}
            {isMoneyRow(gst.adjustmentEx) && (
              <div className="flex items-center justify-between">
                <dt className="text-zinc-600">Adjustment</dt>
                <dd><Price amount={gst.adjustmentEx} className="text-zinc-900" /></dd>
              </div>
            )}
            <div className="flex items-center justify-between">
              <dt className="text-zinc-600">GST</dt>
              <dd><Price amount={gst.tax} className="text-zinc-900" /></dd>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200 pt-1">
              <dt className="font-medium text-zinc-600">Quote Total (inc GST)</dt>
              <dd><Price amount={gst.incTax} className="text-lg font-semibold text-zinc-900" /></dd>
            </div>
            {/* Deposit set by the sales rep on the quote — shown to the customer
                here, and it is the amount the Pay button charges. */}
            {deposit && (
              <>
                <div className="flex items-center justify-between border-t border-zinc-200 pt-1">
                  <dt className="font-medium text-zinc-600">{depositLabel(deposit)}</dt>
                  <dd><Price amount={deposit.due_now} className="font-semibold text-zinc-900" /></dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-600">Balance</dt>
                  <dd><Price amount={deposit.balance} className="text-zinc-900" /></dd>
                </div>
              </>
            )}
          </dl>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-600">Quote Total</span>
            <span className="text-sm font-medium text-zinc-500">To be quoted</span>
          </div>
        )}
      </div>

      {/* Customer notes */}
      {quote.customer_notes && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900 mb-1">Your notes</h2>
          <p className="text-sm text-zinc-600 whitespace-pre-wrap">{quote.customer_notes}</p>
        </div>
      )}

      {/* Customer self-service actions */}
      <QuoteActions quoteId={quote.id} status={status} acceptState={acceptState} />
      {/* Pay this quote — inside the logged-in account area, per Steve. The
          panel renders even while pricing is being prepared: the Pay button
          stays visible and greyed with the reason rather than vanishing. */}
      {
        <QuotePayPanel
          quoteId={quote.id}
          payState={payState}
          amountDue={formatMoney(amountDue, quote.currency_code)}
          amountKnown={!hidePrices && total !== null}
          totalDue={formatMoney(gst.incTax, quote.currency_code)}
          depositNote={
            deposit
              ? `${depositLabel(deposit)} of ${formatMoney(
                  deposit.total_inc,
                  quote.currency_code
                )} — ${formatMoney(deposit.balance, quote.currency_code)} to follow.`
              : null
          }
          methods={payMethods}
          stripePublishableKey={stripeGateway?.credentials?.publishable_key}
          addressSummary={addressSummary}
          addressOptions={addressOptions}
          freightPending={freightPending}
          currency={quote.currency_code || "AUD"}
        />
      }
    </AccountShell>
  );
}
