"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelSubscription } from "@/lib/actions/subscription";

export function CancelConfirmationModal({
  currentPeriodEnd,
  totalEntries,
  consecutiveMonths,
}: {
  currentPeriodEnd: string | null;
  totalEntries: number;
  consecutiveMonths: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    const result = await cancelSubscription();
    if (result.success) {
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error || "Failed to cancel");
      setCancelling(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-red-600 hover:text-red-800 underline"
      >
        Cancel membership
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !cancelling && setOpen(false)} />
          <div className="relative bg-white border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary mb-3">
              Are you sure?
            </h2>

            <div className="space-y-3 text-sm text-text-body mb-6">
              {currentPeriodEnd && (
                <p>
                  Your benefits will remain active until{" "}
                  <strong>{new Date(currentPeriodEnd).toLocaleDateString()}</strong>,
                  then your membership will end.
                </p>
              )}

              {totalEntries > 0 && (
                <p className="text-red-600">
                  You will forfeit your <strong>{totalEntries} raffle {totalEntries === 1 ? "entry" : "entries"}</strong> for upcoming draws.
                </p>
              )}

              {consecutiveMonths > 0 && (
                <p>
                  You will lose your <strong>{consecutiveMonths}-month</strong> consecutive membership streak.
                </p>
              )}

              <p>By cancelling, you will lose access to:</p>
              <ul className="list-disc list-inside space-y-1 text-text-secondary">
                <li>Member-exclusive pricing</li>
                <li>Monthly raffle entries</li>
                <li>Partner offers and discounts</li>
              </ul>
            </div>

            {error && (
              <p className="text-sm text-red-600 mb-4">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={cancelling}
                className="btn-primary flex-1"
              >
                Keep Membership
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 border border-red-300 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {cancelling ? "Cancelling..." : "Cancel Membership"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
