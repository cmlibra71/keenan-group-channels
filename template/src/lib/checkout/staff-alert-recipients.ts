/**
 * Keep the internal "new order" alert away from the person who placed the order.
 *
 * Staff whose own address sits on a channel's `order_notification_emails` list
 * also buy from the storefront. Without this filter they get TWO emails for one
 * order — their customer confirmation, plus the internal alert about their own
 * purchase, addressed to a different recipient list — which is exactly what was
 * reported on Chef's Depot.
 *
 * Comparison is trim- and case-insensitive because the settings list is typed by
 * hand while the purchaser's address comes from the checkout form. Everyone else
 * on the list is untouched, and a checkout with no email keeps the full list
 * (there is nobody to exclude).
 */
export function excludePurchaser(
  recipients: string[],
  purchaserEmail: string | null | undefined
): string[] {
  const purchaser = typeof purchaserEmail === "string" ? purchaserEmail.trim().toLowerCase() : "";
  if (!purchaser) return recipients;
  return recipients.filter((r) => r.trim().toLowerCase() !== purchaser);
}
