"use client";

import { useActionState } from "react";
import { requestEmailChange } from "@/lib/actions/account-security";

export function ChangeEmailForm() {
  const [state, formAction, isPending] = useActionState(requestEmailChange, null);

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
          <label htmlFor="newEmail" className="block text-sm font-medium text-zinc-700">
            New email address
          </label>
          <input
            type="email"
            id="newEmail"
            name="newEmail"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="new@email.com"
          />
          <p className="mt-1 text-xs text-zinc-400">
            We&apos;ll send a confirmation link to the new address. The change only applies once you
            confirm it there.
          </p>
        </div>
        <div>
          <label htmlFor="emailCurrentPassword" className="block text-sm font-medium text-zinc-700">
            Current password
          </label>
          <input
            type="password"
            id="emailCurrentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {isPending ? "Sending..." : "Send confirmation link"}
        </button>
      </form>
    </div>
  );
}
