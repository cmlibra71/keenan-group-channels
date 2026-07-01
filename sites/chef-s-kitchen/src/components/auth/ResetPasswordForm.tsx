"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/account-security";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPassword, null);

  return (
    <div className="card p-8">
      <p className="body-text mb-6">Choose a new password for your account.</p>

      {state?.error && <div className="mb-4 alert-error">{state.error}</div>}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
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
            className="mt-1 block w-full input"
          />
          <p className="mt-1 text-xs text-text-secondary">At least 8 characters.</p>
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
            className="mt-1 block w-full input"
          />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? "Saving..." : "Set new password"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        <Link href="/account/forgot-password" className="text-text-primary font-medium hover:underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}
