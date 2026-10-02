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

/**
 * The offer items the shopper took out of THIS cart (Zoey's Allow Removal From Cart = Yes; card
 * vmO0TRBD), so the reward sync does not put them straight back. Keys are `<promotion id>:<SKU>`.
 */
const DECLINED_COOKIE = "declined_rewards";

export async function getDeclinedRewards(cartUuid: string | null | undefined): Promise<Set<string>> {
  const { parseDeclinedRewards } = await import("@/lib/promotions/cart-offers");
  const cookieStore = await cookies();
  return parseDeclinedRewards(cookieStore.get(DECLINED_COOKIE)?.value, cartUuid ?? null);
}

export async function addDeclinedReward(cartUuid: string, key: string): Promise<void> {
  const { serializeDeclinedRewards } = await import("@/lib/promotions/cart-offers");
  const current = await getDeclinedRewards(cartUuid);
  current.add(key);
  const cookieStore = await cookies();
  cookieStore.set(DECLINED_COOKIE, serializeDeclinedRewards(cartUuid, current), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE,
  });
}
