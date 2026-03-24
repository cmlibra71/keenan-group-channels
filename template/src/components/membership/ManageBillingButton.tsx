"use client";

import { useState } from "react";
import { createBillingPortalSession } from "@/lib/actions/subscription";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const result = await createBillingPortalSession(window.location.href);
    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-sm font-medium text-zinc-700 hover:text-zinc-900 underline disabled:opacity-50 transition-colors"
    >
      {loading ? "Loading..." : "Manage Billing"}
    </button>
  );
}
