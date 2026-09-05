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
    <div className="border border-zinc-200 rounded-lg p-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-zinc-300 mx-auto" />
        <p className="mt-2 text-zinc-500">
          {knownDevice ? "Welcome back. Enter your password to sign in." : "Sign in to your account"}
        </p>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
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
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
          {knownDevice && (
            <p className="mt-1">
              <button
                type="button"
                onClick={forgetDevice}
                className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Not you? Use a different email
              </button>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus={knownDevice}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-right">
            <Link
              href="/account/forgot-password"
              className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link href={next ? `/account/register?next=${encodeURIComponent(next)}` : "/account/register"} className="text-zinc-900 font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
