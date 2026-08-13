"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { register } from "@/lib/actions/auth";

// `next` carries the page the customer was originally sent to (an emailed order
// link, typically) through registration, so a guest who has to create an account
// before they can see their order still lands on it.
export function RegisterForm({ next }: { next?: string | null }) {
  const [state, formAction, isPending] = useActionState(register, null);
  // Kept so the "Sign in" offer below can carry the address they typed straight
  // into the sign-in form, instead of making them type it a second time.
  const [email, setEmail] = useState("");

  const signInHref = (() => {
    const params = new URLSearchParams();
    if (next) params.set("next", next);
    if (email.trim()) params.set("email", email.trim());
    const query = params.toString();
    return query ? `/account?${query}` : "/account";
  })();

  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-8">

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
          {/* Don't leave them on a dead end: one click to the sign-in they were
              just told to use, with the address they typed carried across. */}
          {state.emailTaken && (
            <>
              {" "}
              <Link href={signInHref} className="font-semibold underline hover:no-underline">
                Sign in
              </Link>
            </>
          )}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="field-label">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              autoComplete="given-name"
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
              autoComplete="family-name"
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
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            autoComplete="new-password"
            required
            minLength={8}
            pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}"
            title="At least 8 characters, one capital letter and one special character."
            className="mt-1 block w-full input"
            placeholder="8+ chars, 1 capital, 1 special character"
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
        <Link href={next ? `/account?next=${encodeURIComponent(next)}` : "/account"} className="text-text-primary font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
