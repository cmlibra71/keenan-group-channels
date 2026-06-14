import { customerService, customerAddressService } from "@/lib/store";

/**
 * A member must have company + phone + a default billing address before the
 * onboarding step counts as complete. Reads return snake_case (transformRow).
 */
export type MembershipProfile = {
  customer: Record<string, unknown> | null;
  defaultBilling: Record<string, unknown> | null;
  addresses: Record<string, unknown>[];
  complete: boolean;
};

export async function getMembershipProfile(
  customerId: number
): Promise<MembershipProfile> {
  const customer = await customerService.getById(customerId).catch(() => null);
  let addresses: Record<string, unknown>[] = [];
  try {
    const list = await customerAddressService.listForParent(customerId, {
      page: 1,
      limit: 50,
      sort: "id",
      direction: "desc",
    });
    addresses = (list as { data: Record<string, unknown>[] }).data ?? [];
  } catch {
    addresses = [];
  }
  const defaultBilling =
    addresses.find((a) => a.is_default_billing) ?? null;
  const complete = Boolean(
    customer?.company && customer?.phone && defaultBilling
  );
  return { customer, defaultBilling, addresses, complete };
}
