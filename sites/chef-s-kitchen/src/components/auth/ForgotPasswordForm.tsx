"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/account-security";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordReset, null);

  return (
    <div className="card p-8">
      <p className="body-text mb-6">
        Enter the email on your account and we&apos;ll send you a link to reset your password.
      </p>

      {state?.error && <div className="mb-4 alert-error">{state.error}</div>}
      {state?.success && <div className="mb-4 alert-success">{state.message}</div>}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="mt-1 block w-full input"
            placeholder="your@email.com"
          />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        <Link href="/account" className="text-text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
