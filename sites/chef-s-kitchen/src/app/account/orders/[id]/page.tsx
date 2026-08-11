import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Package } from "lucide-react";
import { ApiError } from "@keenan/services";
import { getSession } from "@/lib/auth";
import { signInRedirect } from "@/lib/account-redirect";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import {
  orderService,
  shipmentService,
  productImageService,
  getLinkableProductPaths,
  getCheckoutSettings,
  getAccountNetTermsDays,
  isGuestOrderForEmail,
  CHANNEL_ID,
} from "@/lib/store";
import { canViewOrder } from "@/lib/orders/order-access";
import {
  orderStatusChipClass,
  orderTotalRows,
  visibleTransaction,
} from "@/lib/orders/order-presentation";
import { customerOrderStage } from "@/lib/orders/order-status-label";
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
// These interfaces deliberately name ONLY the customer-facing columns. The row
// carries plenty that is staff-only — internal_memo (which the checkout stamps
// with a below-cost pricing warning), staff_notes, metafields, and per-line cost
// prices — and none of it is read here, rendered, or passed to a client
// component.
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
  // Own order → straight through. Otherwise resolve exactly what the list
  // resolves: account-wide visibility for a role that grants view_company_orders,
  // else the normalised guest-email match. Failure is a 404, never a part-render.
  let accountMemberIds: number[] = [];
  let guestEmailMatch = false;
  if (order.contact_id !== session.contactId) {
    if (order.contact_id == null) {
      guestEmailMatch = await isGuestOrderForEmail(order.id, session.email);
    } else {
      const perms = await getContactPermissions(session.contactId);
      const seesWholeAccount =
        perms.isB2B && perms.accountId !== null && perms.can("view_company_orders");
      // An empty member list (lookup failure) degrades to own-only, never wider.
      accountMemberIds = seesWholeAccount ? await getAccountContactIds(perms.accountId!) : [];
    }
  }

  const allowed = canViewOrder({
    orderChannelId: order.channel_id,
    orderContactId: order.contact_id,
    channelId: CHANNEL_ID,
    sessionContactId: session.contactId,
    accountMemberIds,
    guestEmailMatch,
  });
  if (!allowed) notFound();

  const items = order.items ?? [];
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
      // itself carries none. Only worth a query on a net-terms order.
      order.payment_method === "net_terms"
        ? getAccountNetTermsDays(order.account_id, order.contact_id)
        : Promise.resolve(null),
    ]);

  const thumbByProduct = new Map(
    thumbs.map((t) => [t.product_id, t.url_thumbnail || t.url_standard])
  );
  const shipments = (shipmentPage.data ?? []) as unknown as ShipmentRow[];

  const orderNumber = order.order_number || `#${order.id}`;
  const placed = formatDate(order.created_at);

  const totalEx = money(order.total_ex_tax);
  const totalInc = money(order.total_inc_tax);
  const gst = money(order.total_tax);

  // Subtotal / delivery / handling, plus the row that reconciles them to the
  // stored total — real orders carry store credits and imported ones do not
  // always balance, and a breakdown that fails to add up reads as a mistake.
  const totalRows = orderTotalRows({
    subtotalExTax: money(order.subtotal_ex_tax),
    subtotalIncTax: money(order.subtotal_inc_tax),
    shippingExTax: money(order.shipping_cost_ex_tax),
    shippingIncTax: money(order.shipping_cost_inc_tax),
    handlingExTax: money(order.handling_cost_ex_tax),
    handlingIncTax: money(order.handling_cost_inc_tax),
    totalExTax: totalEx,
    totalIncTax: totalInc,
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

      <p className="eyebrow mb-3">ORDER</p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="page-title">Order {orderNumber}</h1>
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

      {/* ── Items ─────────────────────────────────────────────────────────── */}
      <h2 className="panel-title mb-3">Items</h2>
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
                    exTax={money(item.price_ex_tax)}
                    incTax={money(item.price_inc_tax)}
                  />{" "}
                  each
                </p>
              </div>
              <div className="text-right">
                <OrderMoney
                  exTax={money(item.total_ex_tax)}
                  incTax={money(item.total_inc_tax)}
                  className="text-sm font-semibold text-text-primary"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Totals ────────────────────────────────────────────────────────── */}
      <OrderTotals rows={totalRows} totalExTax={totalEx} totalIncTax={totalInc} gst={gst} />

      {/* ── Payment ─────────────────────────────────────────────────────────
          `transactions` is whitelisted at THIS boundary: the raw rows carry the
          Stripe payment-intent id, the raw gateway response and fraud/AVS/CVV
          results, and none of that goes any further than this file. */}
      <PaymentSection
        paymentMethod={order.payment_method}
        paymentStatus={order.payment_status}
        totalIncTax={totalInc}
        refundedAmount={money(order.refunded_amount)}
        transactions={(order.transactions ?? []).map(visibleTransaction)}
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
