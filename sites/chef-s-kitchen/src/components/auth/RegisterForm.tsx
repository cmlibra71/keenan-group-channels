"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register } from "@/lib/actions/auth";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(register, null);

  return (
    <div className="border border-stone p-8">
      <h2 className="text-lg heading-serif text-navy text-center mb-6">
        Create an Account
      </h2>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-ink">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-ink">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            />
          </div>
        </div>
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
            minLength={8}
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-light">
        Already have an account?{" "}
        <Link href="/account" className="text-navy font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
