/** channel_settings key the portal's Settings → Sign-in Notices writes. */
export const SIGN_IN_NOTICES_KEY = "account_sign_in_notices";
export const NOTICE_KEY_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Pure: the notice text for `key` from the stored value, or null. */
export function noticeTextFrom(value: unknown, key: unknown): string | null {
  if (typeof key !== "string" || !NOTICE_KEY_RE.test(key)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Object.prototype.hasOwnProperty.call(value, key)) return null;
  const text = (value as Record<string, { text?: unknown } | undefined>)[key]?.text;
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 300) : null;
}
