"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/account-security";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, null);

  return (
    <div className="border border-zinc-200 rounded-lg p-8">
      <p className="text-zinc-500 mb-6">
        Enter the email on your account and we&apos;ll send you a link to reset your password.
      </p>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{state.error}</div>
      )}
      {state?.success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg">{state.message}</div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {isPending ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/account" className="text-zinc-900 font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
