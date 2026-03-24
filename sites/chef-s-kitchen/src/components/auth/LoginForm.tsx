"use client";

import { useActionState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="border border-stone p-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-ink-faint mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-ink-light">Sign in to your account</p>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            required
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-light">
        Don&apos;t have an account?{" "}
        <Link href="/account/register" className="text-navy font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
