"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  fallbackHref: string;
  fallbackLabel: string;
  className?: string;
}

export function BackButton({ fallbackHref, fallbackLabel, className }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={`inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 transition-colors ${className ?? ""}`}
    >
      <ChevronLeft className="h-4 w-4 mr-1" />
      {fallbackLabel}
    </button>
  );
}
