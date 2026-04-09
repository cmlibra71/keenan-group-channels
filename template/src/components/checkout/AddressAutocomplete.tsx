"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { searchAddresses, getAddressDetails } from "@/lib/actions/address";
import type { PlacePrediction } from "@/lib/actions/address";

type Props = {
  onSelect: (address: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
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
      const results = await searchAddresses(query);
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

      const details = await getAddressDetails(prediction.placeId);
      if (details) {
        onSelect({
          address1: details.address1,
          city: details.city,
          state: details.state,
          postalCode: details.postalCode,
          countryCode: details.countryCode,
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
