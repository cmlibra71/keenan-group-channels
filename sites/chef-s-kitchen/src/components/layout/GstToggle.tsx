"use client";

import { useGst } from "@/lib/gst";

/**
 * Storewide pricing toggle — flips catalog prices between GST-exclusive
 * (trade default) and GST-inclusive. Design-system switch: on the green
 * masthead the track is translucent white and turns GOLD when inclusive;
 * on light surfaces (variant="light") it's steel → teal.
 */
export function GstToggle({
  className = "",
  variant = "masthead",
}: {
  className?: string;
  variant?: "masthead" | "light";
}) {
  const { inclusive, toggle } = useGst();
  const onMasthead = variant === "masthead";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={inclusive}
      title="Toggle GST-inclusive pricing"
      className={`inline-flex items-center gap-2 text-xs font-semibold whitespace-nowrap transition-colors ${
        onMasthead ? "text-white/90 hover:text-white" : "text-text-secondary hover:text-text-primary"
      } ${className}`}
    >
      <span>{inclusive ? "Including GST" : "Excluding GST"}</span>
      <span
        className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${
          inclusive
            ? onMasthead
              ? "bg-member"
              : "bg-accent"
            : onMasthead
              ? "bg-white/35"
              : "bg-steel-300"
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform duration-200 ${
            inclusive ? "translate-x-[20px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}
