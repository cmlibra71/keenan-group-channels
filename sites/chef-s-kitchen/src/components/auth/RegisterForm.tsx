"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register } from "@/lib/actions/auth";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(register, null);

  return (
    <div className="card p-8">
      <h2 className="panel-title text-center mb-6">
        Create an Account
      </h2>

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="field-label">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              className="mt-1 block w-full input"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="field-label">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              className="mt-1 block w-full input"
            />
          </div>
        </div>
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
            minLength={8}
            className="mt-1 block w-full input"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        Already have an account?{" "}
        <Link href="/account" className="text-text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
