import { Package } from "lucide-react";

export const metadata = {
  title: "Order History",
};

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-8">Order History</h1>

      <div className="text-center py-16">
        <Package className="h-16 w-16 text-zinc-300 mx-auto" />
        <p className="mt-4 text-zinc-500">No orders yet.</p>
      </div>
    </div>
  );
}
