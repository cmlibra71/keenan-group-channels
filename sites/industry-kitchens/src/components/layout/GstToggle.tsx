"use client";

import { ChevronDown } from "lucide-react";
import { useGst } from "@/lib/gst";

// Storewide pricing toggle — flips catalog prices between GST-exclusive
// (default) and GST-inclusive.
export function GstToggle({ className = "" }: { className?: string }) {
  const { inclusive, toggle } = useGst();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={inclusive}
      title="Toggle GST-inclusive pricing"
      className={`inline-flex items-center gap-1 text-xs font-medium text-zinc-500 whitespace-nowrap transition-colors hover:text-[#D94B2B] ${className}`}
    >
      {inclusive ? "Including GST" : "Excluding GST"}
      <ChevronDown className="h-3 w-3" />
    </button>
  );
}
