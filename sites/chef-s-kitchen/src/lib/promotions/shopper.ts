import { getSession } from "@/lib/auth";
import { getAccountId } from "@/lib/member";

/**
 * Who is shopping, for the offers: their contact, their trade account (which decides their customer
 * group) and their email (a guest's identity for a coupon's per-customer cap). Read in one place so
 * the cart, the coupon box and the checkout all judge offers for the same person.
 * (Card p6YVxc4P, round 4.)
 */
export async function currentShopperForOffers(): Promise<{
  contactId: number | null;
  accountId: number | null;
  email: string | null;
}> {
  const session = await getSession().catch(() => null);
  if (!session) return { contactId: null, accountId: null, email: null };
  const accountId = await getAccountId().catch(() => null);
  return { contactId: session.contactId ?? null, accountId, email: session.email ?? null };
}
