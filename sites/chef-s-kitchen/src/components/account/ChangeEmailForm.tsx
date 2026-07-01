"use client";

import { useActionState } from "react";
import { requestEmailChange } from "@/lib/actions/account-security";

export function ChangeEmailForm() {
  const [state, formAction, isPending] = useActionState(requestEmailChange, null);

  return (
    <div className="border border-border rounded-card bg-white p-6 shadow-sm">
      {state?.error && <div className="mb-4 alert-error">{state.error}</div>}
      {state?.success && <div className="mb-4 alert-success">{state.message}</div>}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="newEmail" className="field-label">
            New email address
          </label>
          <input
            type="email"
            id="newEmail"
            name="newEmail"
            required
            className="mt-1 block w-full input"
            placeholder="new@email.com"
          />
          <p className="mt-1 text-xs text-text-secondary">
            We&apos;ll send a confirmation link to the new address. The change only applies once you
            confirm it there.
          </p>
        </div>
        <div>
          <label htmlFor="emailCurrentPassword" className="field-label">
            Current password
          </label>
          <input
            type="password"
            id="emailCurrentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="mt-1 block w-full input"
          />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Sending..." : "Send confirmation link"}
        </button>
      </form>
    </div>
  );
}
