"use client";

import { useActionState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="card p-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">Sign in to your account</p>
      </div>

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
        </div>
      )}

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
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            required
            className="mt-1 block w-full input"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        Don&apos;t have an account?{" "}
        <Link href="/account/register" className="text-text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
