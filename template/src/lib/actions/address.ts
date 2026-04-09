"use server";

import { googlePlacesService, getCheckoutSettings } from "@/lib/store";
import type { PlacePrediction, ParsedAddress } from "@keenan/services/integrations";

export type { PlacePrediction, ParsedAddress };

export async function searchAddresses(query: string): Promise<PlacePrediction[]> {
  if (!query || query.length < 3) return [];

  const settings = await getCheckoutSettings();
  const countryCodes = settings.supportedCountries.map((c) => c.code.toLowerCase());

  return googlePlacesService.autocomplete(query, countryCodes);
}

export async function getAddressDetails(placeId: string): Promise<ParsedAddress | null> {
  if (!placeId) return null;
  return googlePlacesService.getPlaceDetails(placeId);
}
