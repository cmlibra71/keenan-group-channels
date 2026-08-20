import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Package } from "lucide-react";
import { ApiError } from "@keenan/services";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import {
  orderService,
  shipmentService,
  productImageService,
  getLinkableProductPaths,
  getCheckoutSettings,
  getAccountNetTermsDays,
  CHANNEL_ID,
} from "@/lib/store";
import { canCustomerViewOrder } from "@/lib/orders/order-visibility";
import { payBalanceForOrder } from "@/lib/orders/pay-balance-site";
import { isUnpayableOrderStatus } from "@/lib/orders/pay-balance";
import {
  orderStatusChipClass,
  orderLineBasis,
  orderTaxFactor,
  orderTotalRows,
  gstInclusiveAmount,
  paymentPosition,
  visibleTransaction,
  isNetTermsMethod,
} from "@/lib/orders/order-presentation";
import { orderDocumentName } from "@/lib/orders/order-document-name";
import { customerOrderStage } from "@/lib/orders/order-status-label";
import { readCustomerOrderNotes } from "@/lib/orders/customer-order-notes";
import { EYEBROW_CLASS, PAGE_TITLE_CLASS, PANEL_TITLE_CLASS } from "@/lib/orders/order-page-styles";
import { OrderMoney, OrderTotals } from "@/components/account/OrderMoney";
import { PaymentSection } from "./payment-section";
import { ShipmentsSection } from "./shipments-section";
import { AccountShell } from "@/components/account/AccountShell";

export const metadata = {
  title: "Order",
};

// ────────────────────────────────────────────────────────────────────────────
// Row shapes. Services return snake_case (transformRow).
//
// These interfaces name the columns this page RENDERS, plus two it only reasons
// about (`external_source`, `status`). Nothing staff-only is rendered or passed
// to a client component: `internal_memo` (which checkout stamps with a below-cost
// pricing warning), `staff_notes` and the per-line cost prices are never named
// here.
//
// `metafields` is the one bag this page reaches into, and it reads exactly TWO
// keys out of it, each through its own reader that returns only named fields:
// `net_terms_days`, a commercial term the customer is entitled to be told, and
// `customer_order_notes` — the notes a staff member deliberately published with
// the portal's "Visible on Store Frontend" tick (mlZ3aTT1). Nothing else in the
// bag is read, rendered or handed to a client component.
//
// KNOWN GAP, recorded rather than papered over (card BIig1Zo1, and see
// docs/behaviour/customers.md → sf-account-orders): the narrowing above is on the
// RENDER, not on the READ. `orderService.getByIdScoped` is a plain `.select()`
// over `orders` with `items` and `transactions` as includes, so the whole row —
// staff notes, internal memo, per-line cost prices, raw gateway columns — is
// loaded into this process and only these fields are used. BIig1Zo1 fixed exactly
// this shape on the customer QUOTE page by projecting the columns in SQL, and the
// same is owed here. It was deliberately not done under D045H6Zh: re-shaping the
// read of a live money page is its own change with its own verification, and
// doing it as a side effect of adding a route to a second storefront is how a
// figure moves without anyone noticing. `visibleTransaction` already whitelists
// the transaction rows at the component boundary, which is what stops the gateway
// internals reaching the browser in the meantime.
// ────────────────────────────────────────────────────────────────────────────

interface OrderItemRow {
  id: number;
  product_id: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  price_ex_tax: string | null;
  price_inc_tax: string | null;
  total_ex_tax: string | null;
  total_inc_tax: string | null;
  product_options?: unknown;
  /**
   * Set when a staff order amendment moved this line onto a replacement order. The goods and
   * their money left THIS order — its stored totals were re-computed without them — so listing
   * the line here shows the customer priced rows that do not add up to the total below.
   */
  cancelled_at?: string | null;
}

interface ShippingAddressRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_or_province: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  shipping_method: string | null;
}

interface TransactionRow {
  id: number;
  created_at: string | Date | null;
  amount: string | null;
  event: string;
  status: string;
}

interface OrderDetail {
  id: number;
  channel_id: number;
  contact_id: number | null;
  account_id: number | null;
  /**
   * Never rendered. Read ONLY so the Pay-by-card button stays off Zoey-imported
   * orders, whose payments have not come across yet and whose "outstanding"
   * figure is therefore missing data rather than real debt (cards Sh03niVC,
   * 1IPO2D53).
   */
  external_source: string | null;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  customer_po: string | null;
  delivery_notes: string | null;
  required_delivery_date: string | null;
  subtotal_ex_tax: string | null;
  subtotal_inc_tax: string | null;
  shipping_cost_ex_tax: string | null;
  shipping_cost_inc_tax: string | null;
  handling_cost_ex_tax: string | null;
  handling_cost_inc_tax: string | null;
  store_credit_amount: string | null;
  discount_amount: string | null;
  refunded_amount: string | null;
  total_ex_tax: string | null;
  total_inc_tax: string | null;
  total_tax: string | null;
  xero_invoice_number: string | null;
  xero_invoice_status: string | null;
  created_at: string | Date | null;
  metafields?: Record<string, unknown> | null;
  items?: OrderItemRow[];
  shipping_addresses?: ShippingAddressRow[];
  transactions?: TransactionRow[];
}

interface ShipmentRow {
  id: number;
  tracking_number: string | null;
  tracking_carrier: string | null;
  tracking_url: string | null;
  shipping_method: string | null;
  shipping_provider: string | null;
  shipped_at: string | Date | null;
  created_at: string | Date | null;
  items?: Array<{ id: number; order_item_id: number; quantity: number }>;
}

function money(value: unknown): number {
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

/** Variant / option wording on a line, from the checkout's product_options snapshot. */
function optionSummary(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const o = entry as Record<string, unknown>;
      const name = String(o.display_name ?? o.name ?? "").trim();
      const value = String(o.display_value ?? o.value ?? "").trim();
      if (!value) return "";
      return name ? `${name}: ${value}` : value;
    })
    .filter(Boolean)
    .join(" · ");
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Exactly the order's own id, or nothing: parseInt would read "12abc" — and
  // "0012" — as order 12 and serve it under a URL that is not this order's.
  // Purely syntactic, so it stays ahead of the session guard without disclosing
  // anything; the guard needs the id to send the customer back here afterwards.
  const { id } = await params;
  if (!/^[1-9]\d{0,14}$/.test(id)) notFound();
  const orderId = Number(id);

  // An emailed order link always arrives session-less: carry the destination so
  // signing in lands the customer back on THIS order, not the account panel.
  const session = await getSession();
  if (!session) redirect(signInRedirect(`/account/orders/${orderId}`));

  // Channel-scoped read. getByIdScoped reports an out-of-scope row as MISSING
  // rather than telling the caller it exists, which is what an id-probing request
  // is fishing for.
  let order: OrderDetail;
  try {
    order = (await orderService.getByIdScoped(orderId, { channelId: CHANNEL_ID }, [
      "items",
      "shipping_addresses",
      "transactions",
    ])) as unknown as OrderDetail;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // ── Access gate: the SAME rule the Order History list applies ──────────────
  // Own order → straight through. Otherwise account-wide visibility for a role
  // that grants view_company_orders, else the normalised guest-email match.
  // Failure is a 404, never a part-render. The lookups live in one module because
  // the pay-balance action has to re-ask the identical question before it will
  // charge a card.
  const allowed = await canCustomerViewOrder(order, session);
  if (!allowed) notFound();

  // Lines an amendment moved to a replacement order are not part of this order any more —
  // the Totals block below reads the re-computed order columns, so leaving them in the list
  // shows priced rows that do not sum to the stated total. Dropped once, here, so the item
  // list, the thumbnails, the product-link lookup and the dispatch section all agree.
  const items = (order.items ?? []).filter((i) => !i.cancelled_at);
  const productIds = [
    ...new Set(items.map((i) => i.product_id).filter((v): v is number => typeof v === "number")),
  ];

  const [thumbs, linkablePaths, checkoutSettings, shipmentPage, accountNetTermsDays] =
    await Promise.all([
      productImageService.getThumbnailsForProducts(productIds) as Promise<
        { product_id: number; url_thumbnail: string | null; url_standard: string | null }[]
      >,
      getLinkableProductPaths(productIds),
      getCheckoutSettings(),
      shipmentService.listForParent(order.id, {
        page: 1,
        limit: 50,
        sort: "id",
        direction: "asc",
        includes: ["items"],
      }) as Promise<{ data: unknown[] }>,
      // The term agreed with the account this order bills to, for when the order
      // itself carries none. Only worth a query on a net-terms order — asked of
      // the method's FAMILY, so Zoey's `netterm` and `send_bill` orders (956 on
      // Industry Kitchens) get the lookup too and not just the id our own
      // checkout writes.
      isNetTermsMethod(order.payment_method)
        ? getAccountNetTermsDays(order.account_id, order.contact_id)
        : Promise.resolve(null),
    ]);

  // May this person settle the balance by card, and with what control? THE one
  // per-site seam in this page (`lib/orders/pay-balance-site.tsx`): Chefs Depot
  // wires card Sh03niVC, and a storefront that does not offer card payment on an
  // existing order answers "not offered" without doing any work. Where it IS
  // wired, the same decision is re-made inside `startOrderBalancePayment`, so the
  // button and the charge cannot disagree.
  const { decision: payBalance, panel: payBalancePanel } = await payBalanceForOrder(
    order,
    session,
    { checkoutSettings }
  );

  const thumbByProduct = new Map(
    thumbs.map((t) => [t.product_id, t.url_thumbnail || t.url_standard])
  );
  const shipments = (shipmentPage.data ?? []) as unknown as ShipmentRow[];

  // Notes staff published to this customer from the portal's Order History panel. Read off the
  // order row that is already loaded — no extra query, and the ONLY metafield keys this page
  // touches are this one and the net-terms figure below.
  const customerNotes = readCustomerOrderNotes(order.metafields);

  const orderNumber = order.order_number || `#${order.id}`;
  const placed = formatDate(order.created_at);

  // Named off the SAME payment position the Payment section states, resolved by the same pure
  // function with the same inputs, so the heading can never contradict the figures under it.
  const visibleTransactions = (order.transactions ?? []).map(visibleTransaction);
  const documentName = orderDocumentName({
    amountPaid: paymentPosition({
      paymentStatus: order.payment_status,
      totalIncTax: money(order.total_inc_tax),
      refundedAmount: money(order.refunded_amount),
      transactions: visibleTransactions,
    }).paid,
    paymentStatus: order.payment_status,
  });

  const totalInc = money(order.total_inc_tax);
  const gst = money(order.total_tax);

  // Every figure below is GST-INCLUSIVE (card Roy0kIEz): the storewide toggle is a
  // product-page control (33HGX8U2) and a customer's own order must read the same
  // total here as it did on the Order History list they clicked.
  //
  // `lineBasis` splits the lines the page is about to print into the money that
  // already records its own GST and the money that does not, and it is the input to
  // BOTH the rate and the subtotal below — which is what makes the printed lines sum
  // to the printed Subtotal exactly. It also lets the rate be read off the ORDER
  // TOTAL on the 3,144 Industry Kitchens orders whose subtotal columns were never
  // imported; without it those orders printed ex-GST lines under a $0.00 subtotal.
  // See order-presentation.ts for why the stored columns cannot simply be printed.
  const lineBasis = orderLineBasis(
    items.map((i) => ({ exTax: money(i.total_ex_tax), incTax: money(i.total_inc_tax) }))
  );
  const orderMoney = {
    subtotalExTax: money(order.subtotal_ex_tax),
    subtotalIncTax: money(order.subtotal_inc_tax),
    shippingExTax: money(order.shipping_cost_ex_tax),
    shippingIncTax: money(order.shipping_cost_inc_tax),
    handlingExTax: money(order.handling_cost_ex_tax),
    handlingIncTax: money(order.handling_cost_inc_tax),
    totalIncTax: totalInc,
    lines: lineBasis,
  };
  const taxFactor = orderTaxFactor(orderMoney);

  // Subtotal / delivery / handling, plus the row that reconciles them to the
  // stored total — real orders carry store credits and imported ones do not
  // always balance, and a breakdown that fails to add up reads as a mistake.
  // Empty where the order stored no subtotal and its lines cannot be reconciled to
  // its total: the Order Total then stands on its own rather than over a false
  // breakdown.
  const totalRows = orderTotalRows({
    ...orderMoney,
    storeCreditAmount: money(order.store_credit_amount),
    discountAmount: money(order.discount_amount),
  });

  return (
    <AccountShell>
      <Link
        href="/account/orders"
        className="inline-flex items-center gap-1 mb-6 text-sm text-text-muted hover:text-text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Order History
      </Link>

      {/* What this document is called, in the same words as the copy we print and email
          (card RvWcoPEe): a pro-forma until money arrives, a paid tax invoice receipt once any
          payment has — with what is still outstanding stated in Payment below. */}
      <p className={`${EYEBROW_CLASS} mb-3`}>{documentName}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className={PAGE_TITLE_CLASS}>Order {orderNumber}</h1>
        {/* The status the customer just read on Order History — same word, same
            colour. Both surfaces render customerOrderStage(), never the raw
            `orders.status` column. */}
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${orderStatusChipClass(order.status)}`}
        >
          {customerOrderStage(order.status)}
        </span>
      </div>
      <p className="text-sm text-text-muted mb-8">
        {placed ? `Placed ${placed}` : ""}
        {order.customer_po ? `${placed ? " · " : ""}Your reference: ${order.customer_po}` : ""}
      </p>

      {/* ── Updates staff published to this customer ─────────────────────────
          The other end of the portal Order History panel's "Visible on Store Frontend" tick
          (mlZ3aTT1). Notes only — never a status word: the portal's internal set carries
          finance-company names and the chip above is the only status a customer reads
          (uvRji87U). Absent when nothing has been published. */}
      {customerNotes.length > 0 && (
        <section className="mb-8">
          <h2 className={`${PANEL_TITLE_CLASS} mb-3`}>Updates on this order</h2>
          <ul className="border border-border divide-y divide-border">
            {customerNotes.map((n) => (
              <li key={n.id} className="p-4">
                <p className="text-sm text-text-primary whitespace-pre-line">{n.note}</p>
                {formatDate(n.at) && (
                  <p className="mt-1 text-xs text-text-muted">{formatDate(n.at)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Items ─────────────────────────────────────────────────────────── */}
      <h2 className={`${PANEL_TITLE_CLASS} mb-3`}>Items</h2>
      <div className="border border-border divide-y divide-border">
        {items.length === 0 && (
          <p className="p-4 text-sm text-text-secondary">
            No items are recorded against this order.
          </p>
        )}
        {items.map((item) => {
          const thumb = item.product_id != null ? thumbByProduct.get(item.product_id) : null;
          const path = item.product_id != null ? linkablePaths.get(item.product_id) : undefined;
          const options = optionSummary(item.product_options);
          return (
            <div key={item.id} className="p-4 flex items-center gap-4">
              <div className="relative h-16 w-16 flex-shrink-0 border border-border bg-white overflow-hidden">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt={item.name}
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-text-muted">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {/* Linked only where the product is still on this storefront —
                    a retired product would otherwise 404 from the customer's
                    own order history. */}
                {path ? (
                  <Link
                    href={`/products/${path}`}
                    className="text-sm font-medium text-text-primary hover:underline block"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-text-primary block">{item.name}</span>
                )}
                {options && <p className="text-xs text-text-secondary mt-0.5">{options}</p>}
                <p className="text-xs text-text-muted mt-0.5">SKU: {item.sku || "N/A"}</p>
                <p className="text-sm text-text-secondary mt-1">
                  Qty {item.quantity}
                  {" · "}
                  <OrderMoney
                    amount={gstInclusiveAmount({
                      exTax: money(item.price_ex_tax),
                      incTax: money(item.price_inc_tax),
                      taxFactor,
                    })}
                  />{" "}
                  each
                </p>
              </div>
              <div className="text-right">
                <OrderMoney
                  amount={gstInclusiveAmount({
                    exTax: money(item.total_ex_tax),
                    incTax: money(item.total_inc_tax),
                    taxFactor,
                  })}
                  className="text-sm font-semibold text-text-primary"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      <OrderTotals rows={totalRows} total={totalInc} gst={gst} />

      {/* ── Payment ─────────────────────────────────────────────────────────
          `transactions` is whitelisted at THIS boundary: the raw rows carry the
          Stripe payment-intent id, the raw gateway response and fraud/AVS/CVV
          results, and none of that goes any further than this file. */}
      <PaymentSection
        paymentMethod={order.payment_method}
        paymentStatus={order.payment_status}
        orderPayable={!isUnpayableOrderStatus(order.status)}
        totalIncTax={totalInc}
        refundedAmount={money(order.refunded_amount)}
        transactions={visibleTransactions}
        paymentMethods={checkoutSettings.paymentMethods}
        orderNumber={order.order_number}
        netTermsDaysOnOrder={
          typeof order.metafields?.net_terms_days === "number"
            ? (order.metafields.net_terms_days as number)
            : null
        }
        netTermsDaysOnAccount={accountNetTermsDays}
        xeroInvoiceNumber={order.xero_invoice_number}
        xeroInvoiceStatus={order.xero_invoice_status}
        payBalance={payBalance}
        payBalancePanel={payBalancePanel}
      />

      {/* ── Delivery & dispatch ───────────────────────────────────────────── */}
      <ShipmentsSection
        address={order.shipping_addresses?.[0] ?? null}
        deliveryNotes={order.delivery_notes}
        requiredDeliveryDate={order.required_delivery_date}
        shipments={shipments}
        items={items.map((i) => ({ id: i.id, name: i.name }))}
      />
    </AccountShell>
  );
}
