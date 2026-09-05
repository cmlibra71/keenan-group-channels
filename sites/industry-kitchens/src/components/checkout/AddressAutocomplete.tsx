"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { PlacePrediction } from "@keenan/services/integrations";

/**
 * The typeahead talks to ROUTES (/api/address/*), not to server actions.
 *
 * A server action POSTs to whatever page fired it, so on /checkout every
 * debounce-settle would land in the middleware guard's credential budget and a
 * shopper typing a shipping and a billing address could be handed a 429 in the
 * middle of paying. A GET on /api is ordinary traffic, and carries its own
 * budget (see lib/security/rate-limit-core.ts `address_lookup`).
 */

type Props = {
  onSelect: (address: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
    /** Residential vs commercial, derived from this same pick by the details lookup
     *  (card HMtUxvwZ). Null when the place carried no signal we trust. */
    addressType: string | null;
  }) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

export function AddressAutocomplete({ onSelect, inputRef }: Props) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (query.length < 3) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/address/suggest?q=${encodeURIComponent(query)}`);
      const body = res.ok ? await res.json() : null;
      const results: PlacePrediction[] = body?.predictions ?? [];
      setPredictions(results);
      setIsOpen(results.length > 0);
    } catch {
      setPredictions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInput = useCallback(
    (e: Event) => {
      const value = (e.target as HTMLInputElement).value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => handleSearch(value), 300);
    },
    [handleSearch]
  );

  const handleSelect = useCallback(
    async (prediction: PlacePrediction) => {
      setIsOpen(false);
      setPredictions([]);

      // Suggestions are a convenience: if the lookup is unavailable (or rate
      // limited) the shopper simply keeps typing the address themselves.
      const res = await fetch(
        `/api/address/details?placeId=${encodeURIComponent(prediction.placeId)}`
      );
      const details = res.ok ? (await res.json()).address : null;
      if (details) {
        onSelect({
          address1: details.address1,
          city: details.city,
          state: details.state,
          postalCode: details.postalCode,
          countryCode: details.countryCode,
          addressType: details.addressType ?? null,
        });
      }
    },
    [onSelect]
  );

  // Attach input listener
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.addEventListener("input", handleInput);
    return () => input.removeEventListener("input", handleInput);
  }, [inputRef, handleInput]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen && !isLoading) return null;

  return (
    <div ref={containerRef} className="relative">
      <div className="absolute top-0 left-0 right-0 z-10 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-60 overflow-auto">
        {isLoading && predictions.length === 0 && (
          <div className="px-3 py-2 text-sm text-zinc-400">Searching...</div>
        )}
        {predictions.map((prediction) => (
          <button
            key={prediction.placeId}
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleSelect(prediction)}
          >
            <span className="font-medium text-zinc-900">{prediction.mainText}</span>
            {prediction.secondaryText && (
              <span className="text-zinc-500 ml-1">{prediction.secondaryText}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
