import { redirect } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { getSession } from "@/lib/auth";
import { orderService } from "@/lib/store";

interface OrderRecord {
  id: number;
  orderNumber: string;
  status: string;
  totalIncTax: string;
  createdAt: Date | null;
  items?: Array<{ name: string; quantity: number }>;
}

export const metadata = {
  title: "Order History",
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/account");

  const { data } = await orderService.list({
    page: 1,
    limit: 50,
    sort: "created_at",
    direction: "desc",
    filters: { customer_id: { type: "eq", value: session.customerId } },
  });

  const customerOrders = data as unknown as OrderRecord[];

  if (customerOrders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">Order History</h1>
        <div className="text-center py-16">
          <Package className="h-16 w-16 text-zinc-300 mx-auto" />
          <p className="mt-4 text-zinc-500">No orders yet.</p>
          <Link
            href="/products"
            className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  // Fetch orders with items included
  const ordersWithItems = await Promise.all(
    customerOrders.map(async (order) => {
      const result = await orderService.getById(order.id, ["items"]) as unknown as OrderRecord;
      return result;
    })
  );

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">Order History</h1>
        <Link href="/account" className="text-sm text-zinc-500 hover:text-zinc-900">
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
            <div key={order.id} className="border border-zinc-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-zinc-900">
                    Order #{order.orderNumber}
                  </span>
                  <span className="ml-3 text-sm text-zinc-500">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    order.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : order.status === "shipped"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-zinc-100 text-zinc-600"
                  }`}>
                    {order.status}
                  </span>
                  <span className="font-semibold text-zinc-900">
                    ${parseFloat(order.totalIncTax).toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-sm text-zinc-500">
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
