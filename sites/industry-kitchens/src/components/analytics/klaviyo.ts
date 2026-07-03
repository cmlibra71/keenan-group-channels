/**
 * Client-side Klaviyo helpers for the storefront. Safe to call before the onsite
 * script has loaded — Klaviyo's snippet installs a `window.klaviyo` push-queue that
 * replays queued calls once ready.
 *
 * Metric names MUST match what the worker/portal emit server-side so flows and
 * segments see one consistent event vocabulary:
 *   Viewed Product · Added to Cart · Started Checkout
 */

type KlaviyoQueue = { push: (args: unknown[]) => void };

declare global {
  interface Window {
    klaviyo?: KlaviyoQueue & {
      identify?: (props: Record<string, unknown>) => void;
      track?: (metric: string, props?: Record<string, unknown>) => void;
    };
    _klOnsite?: unknown[];
  }
}

function kl(): (KlaviyoQueue & { track?: (m: string, p?: Record<string, unknown>) => void }) | null {
  if (typeof window === "undefined") return null;
  // The snippet sets window.klaviyo to a queue that flushes on load.
  return window.klaviyo ?? null;
}

/** Fire a Klaviyo metric. No-op when the snippet isn't present (Klaviyo not connected). */
export function klaviyoTrack(metric: string, properties: Record<string, unknown> = {}): void {
  const k = kl();
  if (!k) return;
  try {
    if (typeof k.track === "function") k.track(metric, properties);
    else k.push(["track", metric, properties]);
  } catch {
    /* never let analytics break the page */
  }
}

/** Associate the current browser with a known person (e.g. after login). */
export function klaviyoIdentify(props: Record<string, unknown>): void {
  const k = kl();
  if (!k) return;
  try {
    k.push(["identify", props]);
  } catch {
    /* noop */
  }
}

export interface TrackedProduct {
  id: string | number;
  sku?: string | null;
  name: string;
  price?: number | null;
  url?: string | null;
  imageUrl?: string | null;
  categories?: string[];
  brand?: string | null;
}

function productProps(p: TrackedProduct): Record<string, unknown> {
  return {
    ProductID: p.id,
    SKU: p.sku ?? null,
    ProductName: p.name,
    Name: p.name,
    Price: p.price ?? null,
    URL: p.url ?? (typeof window !== "undefined" ? window.location.href : null),
    ImageURL: p.imageUrl ?? null,
    Categories: p.categories ?? [],
    Brand: p.brand ?? null,
  };
}

export function trackViewedProduct(p: TrackedProduct): void {
  klaviyoTrack("Viewed Product", productProps(p));
}

export function trackAddedToCart(p: TrackedProduct & { quantity?: number }): void {
  klaviyoTrack("Added to Cart", {
    ...productProps(p),
    Quantity: p.quantity ?? 1,
    "$value": p.price ?? undefined,
  });
}

export interface TrackedCheckout {
  value: number;
  itemNames: string[];
  items: Record<string, unknown>[];
  checkoutUrl?: string | null;
}

export function trackStartedCheckout(c: TrackedCheckout): void {
  klaviyoTrack("Started Checkout", {
    "$value": c.value,
    ItemNames: c.itemNames,
    Items: c.items,
    CheckoutURL: c.checkoutUrl ?? (typeof window !== "undefined" ? window.location.href : null),
  });
}
