"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/account-security";

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, null);

  return (
    <div className="border border-zinc-200 rounded-lg p-6">
      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{state.error}</div>
      )}
      {state?.success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg">{state.message}</div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-zinc-700">
            Current password
          </label>
          <input
            type="password"
            id="currentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
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
            autoComplete="new-password"
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
            autoComplete="new-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {isPending ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
