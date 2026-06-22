"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 lg:px-8 section-padding text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-sale/10 mb-4">
        <AlertTriangle className="h-8 w-8 text-sale" />
      </div>
      <p className="eyebrow mb-3">Something went wrong</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-3">We hit a snag</h1>
      <p className="text-text-secondary text-lg mb-8">
        This page couldn&apos;t load right now. Please try again in a moment.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Back to home</Link>
      </div>
    </div>
  );
}
