// ============================================================================
// Who may read an order on the storefront.
//
// The rule is the SAME one /account/orders already applies when it builds the
// history list, restated as one pure function so the list and the per-order page
// can never disagree:
//
//   * the order is on THIS channel                                  (hard gate)
//   * AND one of
//       - it is the viewer's own order (contact_id = session contact), or
//       - it belongs to another contact on the viewer's account AND the viewer's
//         account role grants `view_company_orders`
//         (docs/crm-parity/10-role-enforcement.md), or
//       - it is a GUEST order (no contact) whose billing email resolves to the
//         viewer's inbox — the same normalised match the list uses to surface
//         orders placed before the shopper had an account.
//
// Anything else is not "partially visible" — the caller must 404. A redacted
// render still confirms the order exists, which is exactly what an id-guessing
// probe is looking for.
//
// Pure by design: no I/O, so every branch is unit-tested. The caller does the
// lookups and hands the answers in.
// ============================================================================

export interface OrderAccessInput {
  /** channel_id on the order row. */
  orderChannelId: number;
  /** contact_id on the order row; null for guest and legacy customer-keyed orders. */
  orderContactId: number | null;
  /** The channel this storefront serves. */
  channelId: number;
  /** The signed-in session's contact id. */
  sessionContactId: number;
  /**
   * Active contact ids on the viewer's account — populated ONLY when their role
   * grants `view_company_orders`. An empty list therefore means "own orders only",
   * which is also the safe degradation when the membership lookup fails.
   */
  accountMemberIds: readonly number[];
  /** Result of the normalised billing-email match against this order. */
  guestEmailMatch: boolean;
}

export function canViewOrder(input: OrderAccessInput): boolean {
  const {
    orderChannelId,
    orderContactId,
    channelId,
    sessionContactId,
    accountMemberIds,
    guestEmailMatch,
  } = input;

  // Defence in depth: the read is already channel-scoped, but a cross-channel row
  // must never pass this gate even if a caller forgets the scope.
  if (orderChannelId !== channelId) return false;

  // Own order.
  if (orderContactId != null && orderContactId === sessionContactId) return true;

  // A colleague's order, when the role allows seeing the whole account.
  if (orderContactId != null && accountMemberIds.includes(orderContactId)) return true;

  // Guest order matched on the inbox. Only ever for orders with NO contact —
  // a contact-keyed order that happens to share a billing email belongs to that
  // contact, and the two rules above are the only way in.
  if (orderContactId == null && guestEmailMatch) return true;

  return false;
}
