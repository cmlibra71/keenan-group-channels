import { cache } from "react";
import { getChannelSetting } from "@/lib/store";
import { normalizeSiteStructuredData, SITE_STRUCTURED_DATA_SETTING_KEY, type SiteStructuredData } from "@keenan/services/builder";

/**
 * The storefront's site-wide structured data + default share image (channel setting
 * `site_structured_data`, edited in the portal: Settings → Structured Data & Sharing). null when
 * nothing usable is stored — then nothing is emitted.
 */
export const getSiteStructuredData = cache(async (): Promise<SiteStructuredData | null> => {
  // one read per request (React cache), answered from the 60-second render-config snapshot
  const raw = await getChannelSetting(SITE_STRUCTURED_DATA_SETTING_KEY).catch(() => null);
  if (!raw) return null;
  const r = normalizeSiteStructuredData(raw);
  return r.ok ? r.value : null;
});
