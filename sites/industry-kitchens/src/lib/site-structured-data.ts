import { getChannelSetting } from "@/lib/store";
import { normalizeSiteStructuredData, SITE_STRUCTURED_DATA_SETTING_KEY, type SiteStructuredData } from "@keenan/services/builder";

/**
 * The storefront's site-wide structured data + default share image (channel setting
 * `site_structured_data`, edited in the portal: Settings → Structured Data & Sharing). null when
 * nothing usable is stored — then nothing is emitted.
 */
export async function getSiteStructuredData(): Promise<SiteStructuredData | null> {
  const raw = await getChannelSetting(SITE_STRUCTURED_DATA_SETTING_KEY).catch(() => null);
  if (!raw) return null;
  const r = normalizeSiteStructuredData(raw);
  return r.ok ? r.value : null;
}
