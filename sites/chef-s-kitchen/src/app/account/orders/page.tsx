import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { customerOrderStage } from "@/lib/orders/order-status-label";
import { orderService, CHANNEL_ID, getGuestOrdersForEmail } from "@/lib/store";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import { Price } from "@/components/ui/Price";
import { AccountShell } from "@/components/account/AccountShell";

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

  // Scope to THIS contact (and channel, defence-in-depth). Both are registered
  // filters on OrderService; without the contact_id filter the list would return
  // channel-wide orders. contact_id is the identity-unification subject; legacy
  // customer-keyed orders were contact_id-backfilled in the migration.
  //
  // B2B account-role gate `view_company_orders` (docs/crm-parity/10-role-enforcement.md):
  // a contact whose role GRANTS it sees every order on their account; without it they
  // see only their own. Accountless (B2C) contacts are unaffected — always own-only.
  const perms = await getContactPermissions(session.contactId);
  const seesWholeAccount = perms.isB2B && perms.accountId !== null && perms.can("view_company_orders");
  const memberIds = seesWholeAccount ? await getAccountContactIds(perms.accountId!) : [];
  // An empty member list (lookup failure) degrades to own-only, never to channel-wide.
  const contactFilter =
    memberIds.length > 0
      ? { type: "in" as const, value: memberIds }
      : { type: "eq" as const, value: session.contactId };

  const { data } = await orderService.list({
    page: 1,
    limit: 50,
    sort: "created_at",
    direction: "desc",
    filters: {
      contact_id: contactFilter,
      channel_id: { type: "eq", value: CHANNEL_ID },
    },
  });

  const accountOrders = data as unknown as OrderRecord[];

  // Also surface orders placed as a GUEST under this account's email (e.g. a
  // checkout done before creating the account), matched on the normalized inbox.
  // This is deliberately NOT gated on the net-terms `email_verified` check: that
  // gate exists to stop an unverified self-registration from buying on someone
  // else's B2B *credit* (see net-terms.ts), whereas this is read-only order
  // history. Self-service registration currently never verifies the sign-up email,
  // so gating here permanently hid every self-registered customer's own guest
  // orders from them (the reported bug). The financial net-terms gate is untouched.
  let guestOrders: OrderRecord[] = [];
  try {
    guestOrders = (await getGuestOrdersForEmail(session.email)) as unknown as OrderRecord[];
  } catch {
    // best-effort — never block the page on the guest-order lookup
  }

  // Merge (dedupe by id; guest orders have no contact_id so they can't overlap)
  // and re-sort newest-first.
  const seen = new Set(accountOrders.map((o) => o.id));
  const customerOrders = [...accountOrders, ...guestOrders.filter((o) => !seen.has(o.id))].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );

  if (customerOrders.length === 0) {
    return (
      <AccountShell>
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
      </AccountShell>
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
    <AccountShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-3">ORDERS</p>
          <h1 className="text-3xl heading-serif text-text-primary">Order History</h1>
          {seesWholeAccount && memberIds.length > 1 && (
            <p className="mt-1 text-sm text-text-secondary">
              Showing every order on your account.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {ordersWithItems.map((order) => {
          const orderItemsList = order.items || [];
          const totalItems = orderItemsList.reduce((sum, i) => sum + i.quantity, 0);

          return (
            <div key={order.id} className="card-padded">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="font-semibold text-text-primary hover:underline"
                  >
                    Order #{order.order_number}
                  </Link>
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
                    {customerOrderStage(order.status)}
                  </span>
                  <Price amount={order.total_inc_tax} className="font-semibold text-text-primary" />
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                {totalItems} item{totalItems !== 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
      </div>
    </AccountShell>
  );
}
