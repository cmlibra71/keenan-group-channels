"use client";

import { useGst } from "@/lib/gst";

// Storewide pricing toggle — a switch that flips catalog prices between
// GST-exclusive (default) and GST-inclusive.
export function GstToggle({ className = "" }: { className?: string }) {
  const { inclusive, toggle } = useGst();
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={inclusive}
      title="Toggle GST-inclusive pricing"
      className={`inline-flex items-center gap-2 text-xs font-medium text-text-muted whitespace-nowrap transition-colors hover:text-accent ${className}`}
    >
      <span>{inclusive ? "Including GST" : "Excluding GST"}</span>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          inclusive ? "bg-accent" : "bg-stone-300"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
            inclusive ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
