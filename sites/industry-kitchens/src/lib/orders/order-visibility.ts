// ============================================================================
// The impure half of "may this person see this order?" — the lookups that feed
// the pure `canViewOrder` rule.
//
// It exists because the answer is now needed in TWO places: the order page
// renders under it, and the pay-balance action must re-check it before it will
// create a PaymentIntent. Two copies of an access gate is how one of them ends
// up a version behind, so there is one.
//
// Failure degrades the same way it always has: an account-membership lookup that
// fails yields an EMPTY member list, which means own-orders-only — never wider.
// ============================================================================

import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import { isGuestOrderForEmail, CHANNEL_ID } from "@/lib/store";
import { canViewOrder } from "./order-access";

export interface VisibilityOrderRow {
  id: number;
  channel_id: number;
  contact_id: number | null;
}

export interface VisibilitySession {
  contactId: number;
  email: string;
}

/**
 * True when this signed-in shopper may read this order: their own, a colleague's
 * on an account whose role grants `view_company_orders`, or a guest order placed
 * under their own inbox before they had an account.
 */
export async function canCustomerViewOrder(
  order: VisibilityOrderRow,
  session: VisibilitySession
): Promise<boolean> {
  let accountMemberIds: number[] = [];
  let guestEmailMatch = false;

  if (order.contact_id !== session.contactId) {
    if (order.contact_id == null) {
      guestEmailMatch = await isGuestOrderForEmail(order.id, session.email);
    } else {
      const perms = await getContactPermissions(session.contactId);
      const seesWholeAccount =
        perms.isB2B && perms.accountId !== null && perms.can("view_company_orders");
      accountMemberIds = seesWholeAccount ? await getAccountContactIds(perms.accountId!) : [];
    }
  }

  return canViewOrder({
    orderChannelId: order.channel_id,
    orderContactId: order.contact_id,
    channelId: CHANNEL_ID,
    sessionContactId: session.contactId,
    accountMemberIds,
    guestEmailMatch,
  });
}
