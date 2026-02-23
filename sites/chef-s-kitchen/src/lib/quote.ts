import { cookies } from "next/headers";

const QUOTE_COOKIE = "quote_id";
const QUOTE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getQuoteUuid(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(QUOTE_COOKIE)?.value;
}

export async function setQuoteUuid(uuid: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(QUOTE_COOKIE, uuid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: QUOTE_MAX_AGE,
  });
}

export async function clearQuoteUuid(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(QUOTE_COOKIE);
}
