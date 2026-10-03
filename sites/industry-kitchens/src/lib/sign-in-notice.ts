import { getChannelSetting } from "@/lib/store";
import { NOTICE_KEY_RE, SIGN_IN_NOTICES_KEY, noticeTextFrom } from "./sign-in-notice-text";

/** The sign-in notice for `?notice=<key>`, or null (never throws). */
export async function signInNoticeText(key: unknown): Promise<string | null> {
  if (typeof key !== "string" || !NOTICE_KEY_RE.test(key)) return null;
  const value = await getChannelSetting(SIGN_IN_NOTICES_KEY).catch(() => null);
  return noticeTextFrom(value, key);
}
