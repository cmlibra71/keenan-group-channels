import { cache } from "react";
import { channelSettingsService, CHANNEL_ID } from "@/lib/store";

/**
 * Does this channel store its prices GST-INCLUSIVE?
 *
 * Read the same way the cart page, the checkout page and `placeOrder` already
 * read it (`channel_settings.prices_include_tax`, absent = false), but memoised
 * per request so the promotion engine can ask for it on every cart read without
 * adding a settings lookup to each one.
 *
 * The promotion floor clamp compares a line's price against a floor derived from
 * an EX-GST cost, so the two have to be in the same basis — this is the one input
 * that decides it. Neither live channel sets the flag today.
 */
export const channelPricesIncludeTax = cache(async (): Promise<boolean> => {
  try {
    const setting = await channelSettingsService.getByKey(CHANNEL_ID, "prices_include_tax");
    return setting.setting_value === true || setting.setting_value === "true";
  } catch {
    return false;
  }
});
