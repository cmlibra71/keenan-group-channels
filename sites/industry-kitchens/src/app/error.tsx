"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * A server-side render error never reaches this screen with a 200: Next answers 500 and renders this
 * boundary (checked 2026-09-30 on a production build — a throwing server page and a throwing client
 * component during SSR both return 500). What CAN show it after a 200 page is a failure in the
 * BROWSER: a JavaScript chunk from the other build during a blue-green flip, or a data request that
 * failed while the server was overloaded (IK re-audit round 2 saw both kinds). The document's status
 * cannot change once it is delivered, so the page RECOVERS instead: one full reload, a few seconds
 * later, guarded per address so a real, repeating error still shows this screen instead of looping.
 * The robots tag keeps a crawler that caught the screen from indexing it.
 */
const RETRY_KEY = "ik-error-retry";
const RETRY_WINDOW_MS = 60_000;

function shouldRetryOnce(): boolean {
  try {
    const raw = sessionStorage.getItem(RETRY_KEY);
    const last = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
    const here = window.location.pathname + window.location.search;
    if (last?.path === here && typeof last.at === "number" && Date.now() - last.at < RETRY_WINDOW_MS) return false;
    sessionStorage.setItem(RETRY_KEY, JSON.stringify({ path: here, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    console.error(error);
    if (!shouldRetryOnce()) return;
    setRetrying(true);
    const t = setTimeout(() => window.location.reload(), 2500);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 lg:px-8 section-padding text-center">
      <meta name="robots" content="noindex" />
      <div className="inline-flex items-center justify-center w-16 h-16 bg-sale/10 mb-4">
        <AlertTriangle className="h-8 w-8 text-sale" />
      </div>
      <p className="eyebrow mb-3">Something went wrong</p>
      <h1 className="text-3xl heading-serif text-text-primary mb-3">We hit a snag</h1>
      <p className="text-text-secondary text-lg mb-8">
        {retrying ? "Reloading the page…" : "This page couldn't load right now. Please try again in a moment."}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Back to home</Link>
      </div>
    </div>
  );
}
