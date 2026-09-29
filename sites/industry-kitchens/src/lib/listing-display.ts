import { getChannelSetting } from "@/lib/store";
import {
  LISTING_DISPLAY_SETTING_KEY,
  readListingDisplaySettings,
  type ListingDisplaySettings,
} from "@keenan/services/listing-display-settings";

/**
 * This channel's storefront listing settings (IK hidden-conditionals C25 / S18): page sizes, the
 * brand-range empty fallback, price-band labels and sort options, edited in the portal (Settings →
 * Storefront Listings). Every key falls back to today's value, so a channel that has not saved the
 * setting renders exactly as before. The related-rail rule (S17) is read by the shared store.
 */
export async function getListingDisplay(): Promise<ListingDisplaySettings> {
  return readListingDisplaySettings(await getChannelSetting(LISTING_DISPLAY_SETTING_KEY).catch(() => null));
}
