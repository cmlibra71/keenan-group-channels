import { cookies } from "next/headers";

const CART_COOKIE = "cart_id";
const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getCartUuid(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CART_COOKIE)?.value;
}

export async function setCartUuid(uuid: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CART_COOKIE, uuid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE,
  });
}

export async function clearCartUuid(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CART_COOKIE);
}
