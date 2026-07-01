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
    <div className="card p-8">
      {result?.success ? (
        <>
          <div className="mb-4 alert-success">{result.message}</div>
          <Link
            href="/account/security"
            className="block text-center text-text-primary font-medium hover:underline"
          >
            Back to account security
          </Link>
        </>
      ) : (
        <>
          <p className="body-text mb-6">
            Confirm that you want to change the email address on your account.
          </p>
          {result?.error && <div className="mb-4 alert-error">{result.error}</div>}
          <button type="button" onClick={confirm} disabled={isPending} className="btn-primary w-full">
            {isPending ? "Confirming..." : "Confirm email change"}
          </button>
        </>
      )}
    </div>
  );
}
