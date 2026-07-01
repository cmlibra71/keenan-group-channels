"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmEmailChange } from "@/lib/actions/account-security";

type Result = { error?: string; success?: boolean; message?: string };

export function VerifyEmailConfirm({ token }: { token: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  // Consume the token on an explicit click (never on GET) so email link-scanners
  // and prefetchers can't burn the single-use token before the customer arrives.
  function confirm() {
    startTransition(async () => setResult(await confirmEmailChange(token)));
  }

  return (
    <div className="border border-zinc-200 rounded-lg p-8">
      {result?.success ? (
        <>
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg">
            {result.message}
          </div>
          <Link
            href="/account/security"
            className="block text-center text-zinc-900 font-medium hover:underline"
          >
            Back to account security
          </Link>
        </>
      ) : (
        <>
          <p className="text-zinc-500 mb-6">
            Confirm that you want to change the email address on your account.
          </p>
          {result?.error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{result.error}</div>
          )}
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
          >
            {isPending ? "Confirming..." : "Confirm email change"}
          </button>
        </>
      )}
    </div>
  );
}
