import Link from "next/link";
import { Package, FileText, MapPin, LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { customerService } from "@/lib/store";
import { LoginForm } from "@/components/auth/LoginForm";
import { logout } from "@/lib/actions/auth";

export const metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">My Account</h1>
        <LoginForm />
      </div>
    );
  }

  const customer = await customerService.getById(session.customerId) as {
    firstName: string;
    lastName: string;
    email: string;
  } | null;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">My Account</h1>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </form>
      </div>

      <div className="border border-zinc-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">Welcome back</h2>
        <p className="text-zinc-600">
          {customer?.firstName} {customer?.lastName}
        </p>
        <p className="text-sm text-zinc-500">{customer?.email}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/account/orders"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <Package className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Order History</h3>
            <p className="text-sm text-zinc-500">View your past orders</p>
          </div>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <FileText className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">My Quotes</h3>
            <p className="text-sm text-zinc-500">View and track your quotes</p>
          </div>
        </Link>
        <Link
          href="/products"
          className="flex items-center gap-4 border border-zinc-200 rounded-lg p-6 hover:border-zinc-400 transition-colors"
        >
          <MapPin className="h-8 w-8 text-zinc-400" />
          <div>
            <h3 className="font-semibold text-zinc-900">Continue Shopping</h3>
            <p className="text-sm text-zinc-500">Browse our products</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
