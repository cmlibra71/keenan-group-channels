import { contactService, customerAddressService } from "@/lib/store";

/**
 * A member must have company + phone + a default billing address before the
 * onboarding step counts as complete. Reads return snake_case (transformRow).
 *
 * Identity unification: keyed by CONTACT id. Contacts have no `company`
 * column — company lives under attributes.company — so the returned `customer`
 * record materialises `company` at the top level to keep the profile pages'
 * `customer?.company` reads working unchanged.
 */
export type MembershipProfile = {
  customer: Record<string, unknown> | null;
  defaultBilling: Record<string, unknown> | null;
  addresses: Record<string, unknown>[];
  complete: boolean;
};

export async function getMembershipProfile(
  contactId: number
): Promise<MembershipProfile> {
  const contact = (await contactService.getById(contactId).catch(() => null)) as
    | Record<string, unknown>
    | null;
  const customer: Record<string, unknown> | null = contact
    ? {
        ...contact,
        company:
          ((contact.attributes as Record<string, unknown> | null)?.company as string | undefined) ??
          null,
      }
    : null;
  let addresses: Record<string, unknown>[] = [];
  try {
    addresses = await customerAddressService.listForContact(contactId);
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
