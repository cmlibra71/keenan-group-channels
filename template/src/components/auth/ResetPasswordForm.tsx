"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/account-security";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <div className="border border-zinc-200 rounded-lg p-8">
      <p className="text-zinc-500 mb-6">Choose a new password for your account.</p>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{state.error}</div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
            New password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            required
            minLength={8}
            pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}"
            title="At least 8 characters, one capital letter and one special character."
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">At least 8 characters, one capital letter and one special character.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700">
            Confirm new password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {isPending ? "Saving..." : "Set new password"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/account/forgot-password" className="text-zinc-900 font-medium hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
