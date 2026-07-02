import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { orderService, customerService, CHANNEL_ID, getGuestOrdersForEmail } from "@/lib/store";
import { deniedForUnverifiedSelfRegistration } from "@/lib/checkout/net-terms-policy";
import { Price } from "@/components/ui/Price";

// orderService returns snake_case keys (transformRow).
interface OrderRecord {
  id: number;
  order_number: string;
  status: string;
  total_inc_tax: string;
  created_at: Date | null;
  items?: Array<{ name: string; quantity: number }>;
}

export const metadata = {
  title: "Order History",
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/account");

  // Scope to THIS customer (and channel, defence-in-depth). Both are registered
  // filters on OrderService; without the customer_id filter the list would return
  // channel-wide orders.
  const { data } = await orderService.list({
    page: 1,
    limit: 50,
    sort: "created_at",
    direction: "desc",
    filters: {
      customer_id: { type: "eq", value: session.customerId },
      channel_id: { type: "eq", value: CHANNEL_ID },
    },
  });

  const accountOrders = data as unknown as OrderRecord[];

  // Also surface orders placed as a GUEST under this account's email (e.g. a
  // checkout done before signing in), matched on the normalized inbox. Gated the
  // same way as net terms: an unverified self-registration must not see orders
  // billed to an email it hasn't proven it owns.
  let guestOrders: OrderRecord[] = [];
  try {
    const customer = (await customerService.getById(session.customerId)) as
      | { metafields?: Record<string, unknown> | null }
      | null;
    if (!deniedForUnverifiedSelfRegistration(customer?.metafields)) {
      guestOrders = (await getGuestOrdersForEmail(session.email)) as unknown as OrderRecord[];
    }
  } catch {
    // best-effort — never block the page on the guest-order lookup
  }

  // Merge (dedupe by id; guest orders have no customer_id so they can't overlap)
  // and re-sort newest-first.
  const seen = new Set(accountOrders.map((o) => o.id));
  const customerOrders = [...accountOrders, ...guestOrders.filter((o) => !seen.has(o.id))].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );

  if (customerOrders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
        <p className="eyebrow mb-3">ORDERS</p>
        <h1 className="text-3xl heading-serif text-text-primary mb-8">Order History</h1>
        <div className="text-center section-padding">
          <Package className="h-16 w-16 text-text-muted mx-auto" />
          <p className="mt-4 text-text-secondary">No orders yet.</p>
          <Link
            href="/products"
            className="mt-6 inline-block btn-primary"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Fetch orders with items included; fall back to the list row if getById is null.
  const ordersWithItems = await Promise.all(
    customerOrders.map(async (order) => {
      const result = (await orderService.getById(order.id, ["items"])) as unknown as OrderRecord | null;
      return result ?? order;
    })
  );

  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-8 section-padding">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-3">ORDERS</p>
          <h1 className="text-3xl heading-serif text-text-primary">Order History</h1>
        </div>
        <Link href="/account" className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-300">
          Back to Account
        </Link>
      </div>

      <div className="space-y-4">
        {ordersWithItems.map((order) => {
          const orderItemsList = order.items || [];
          const totalItems = orderItemsList.reduce((sum, i) => sum + i.quantity, 0);
          const itemNames = orderItemsList
            .slice(0, 3)
            .map((i) => i.name)
            .join(", ");

          return (
            <div key={order.id} className="card-padded">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-text-primary">
                    Order #{order.order_number}
                  </span>
                  <span className="ml-3 text-sm text-text-secondary">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    order.status === "completed"
                      ? "text-accent bg-accent-subtle"
                      : order.status === "shipped"
                        ? "bg-accent-subtle text-accent-dark"
                        : "bg-surface-secondary text-text-secondary"
                  }`}>
                    {order.status}
                  </span>
                  <Price amount={order.total_inc_tax} className="font-semibold text-text-primary" />
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
                {itemNames ? `: ${itemNames}` : ""}
                {orderItemsList.length > 3 ? "..." : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
