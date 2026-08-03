"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Holds the thank-you page for a few seconds, then forwards the shopper on so
 * they never sit on a dead-end confirmation (or bounce back into an empty cart
 * via the Back button). Cancellable — a bank-transfer confirmation carries the
 * account details the customer still needs to read.
 *
 * router.replace, not push: the confirmation must not stay in the history stack,
 * or Back from the destination lands on it again and restarts the countdown.
 */
export function ConfirmationRedirect({
  to = "/",
  label = "the home page",
  seconds = 15,
}: {
  to?: string;
  /** Where they're being sent, in words. Keep it in step with `to`. */
  label?: string;
  seconds?: number;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);

  // The countdown is the only clock — the navigation reacts to it reaching zero,
  // so what the shopper reads and what happens can never disagree.
  useEffect(() => {
    if (cancelled) return;
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(tick);
  }, [cancelled]);

  useEffect(() => {
    if (cancelled || remaining > 0) return;
    router.replace(to);
  }, [cancelled, remaining, router, to]);

  if (cancelled) return null;

  return (
    <p className="mt-8 text-sm text-steel-500">
      Returning to {label} in {remaining} second{remaining === 1 ? "" : "s"}.{" "}
      <button
        type="button"
        onClick={() => setCancelled(true)}
        className="font-medium underline hover:no-underline"
      >
        Stay on this page
      </button>
    </p>
  );
}
