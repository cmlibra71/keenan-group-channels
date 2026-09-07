"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { login, forgetThisDevice } from "@/lib/actions/auth";

// `next` is the page the customer was trying to reach when the account guard
// bounced them here (an emailed order link, typically). It rides the form so the
// login action can finish the journey, and the register link so someone who has
// to create an account first still ends up where they were headed.
export function LoginForm({
  next,
  defaultEmail,
  rememberedDevice = false,
}: {
  next?: string | null;
  /** Carried from the register form when that address already has an account. */
  defaultEmail?: string | null;
  /**
   * True when `defaultEmail` came from the known-device cookie rather than from
   * something the customer just typed (card upTMAqRc) — it is what turns the
   * greeting and the "Not you?" escape hatch on.
   */
  rememberedDevice?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(login, null);
  // The remembered address is a starting point, not a lock: it stays an ordinary
  // editable field, and "Not you?" empties it and forgets the browser.
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [knownDevice, setKnownDevice] = useState(rememberedDevice);
  const [, startForgetting] = useTransition();

  function forgetDevice() {
    setKnownDevice(false);
    setEmail("");
    startForgetting(async () => {
      await forgetThisDevice();
    });
  }

  return (
    <div className="card p-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">
          {knownDevice ? "Welcome back. Enter your password to sign in." : "Sign in to your account"}
        </p>
      </div>

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
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
          {knownDevice && (
            <p className="mt-1">
              <button
                type="button"
                onClick={forgetDevice}
                className="text-sm text-text-secondary hover:text-text-primary hover:underline"
              >
                Not you? Use a different email
              </button>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus={knownDevice}
            className="mt-1 block w-full input"
          />
          <p className="mt-1 text-right">
            <Link href="/account/forgot-password" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
              Forgot password?
            </Link>
          </p>
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
        <Link href={next ? `/account/register?next=${encodeURIComponent(next)}` : "/account/register"} className="text-text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
