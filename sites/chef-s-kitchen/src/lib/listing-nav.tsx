"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// ============================================================================
// Instant filter controls for a product listing (category + search pages).
//
// A filter change is a `router.replace` that re-renders the page on the server.
// Until that answer arrives, `useSearchParams()` still reports the OLD address,
// so every control that read it — tick boxes, the price slider, the sort select
// — kept showing the old value, and the old grid sat on screen with no sign
// that anything was happening.
//
// This hook runs every listing navigation through ONE transition and carries
// the address the shopper just asked for as an optimistic value. Controls read
// `params` (the new address, the moment it is asked for) and the page wrapper
// reads `pending` to swap the product cards for same-size loaders. When the
// server answers, the optimistic value falls away and the real address — which
// now says the same thing — takes over.
//
// Outside a provider each control still works on its own (instant, but with no
// shared loading state), so a stray <FacetCheckbox> anywhere cannot break.
// ============================================================================

export interface ListingNav {
  /** The address the listing is heading to — the new one while a change loads. */
  params: URLSearchParams;
  /** True from the moment a filter changes until the server's answer is on screen. */
  pending: boolean;
  /** Navigate to `next` (replace, no scroll) and show it on the controls at once. */
  replace: (next: URLSearchParams) => void;
}

const ListingNavContext = React.createContext<ListingNav | null>(null);

function useOwnListingNav(): ListingNav {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.toString();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useOptimistic(current);
  const params = React.useMemo(() => new URLSearchParams(optimistic), [optimistic]);
  const replace = React.useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      startTransition(() => {
        setOptimistic(qs);
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, setOptimistic]
  );
  return React.useMemo(() => ({ params, pending, replace }), [params, pending, replace]);
}

/**
 * Wrap everything that belongs to one listing (rail, chips, sort, grid). While a
 * change loads, the wrapper carries `data-listing-pending`; the site's CSS turns
 * every child of a `data-listing-grid` element into a loader of the same size.
 * `display: contents`, so the wrapper adds no box to the layout.
 */
export function ListingNavProvider({ children }: { children: React.ReactNode }) {
  const nav = useOwnListingNav();
  return (
    <ListingNavContext.Provider value={nav}>
      <div
        style={{ display: "contents" }}
        data-listing-pending={nav.pending ? "" : undefined}
        aria-busy={nav.pending || undefined}
      >
        {children}
      </div>
    </ListingNavContext.Provider>
  );
}

/** The listing's navigation: the provider's when there is one, else this component's own. */
export function useListingNav(): ListingNav {
  const shared = React.useContext(ListingNavContext);
  const own = useOwnListingNav();
  return shared ?? own;
}
