"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Holds the thank-you page for a few seconds, then forwards the shopper on so
 * they never sit on a dead-end confirmation (or bounce back into an empty cart
 * via the Back button). Cancellable — a bank-transfer confirmation carries the
 * account details the customer still needs to read.
 */
export function ConfirmationRedirect({
  to = "/",
  seconds = 15,
}: {
  to?: string;
  seconds?: number;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled) return;
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    const timer = setTimeout(() => router.push(to), seconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [cancelled, router, to, seconds]);

  if (cancelled) return null;

  return (
    <p className="mt-8 text-sm text-steel-500">
      Returning to the home page in {remaining} second{remaining === 1 ? "" : "s"}.{" "}
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
