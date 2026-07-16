"use client";

import { useActionState } from "react";
import { changePassword } from "@/lib/actions/account-security";

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, null);

  return (
    <div className="border border-border rounded-card bg-white p-6 shadow-sm">
      {state?.error && <div className="mb-4 alert-error">{state.error}</div>}
      {state?.success && <div className="mb-4 alert-success">{state.message}</div>}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="currentPassword" className="field-label">
            Current password
          </label>
          <input
            type="password"
            id="currentPassword"
            name="currentPassword"
            required
            autoComplete="current-password"
            className="mt-1 block w-full input"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
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
            className="mt-1 block w-full input"
          />
          <p className="mt-1 text-xs text-text-secondary">At least 8 characters, one capital letter and one special character.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="field-label">
            Confirm new password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 block w-full input"
          />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
