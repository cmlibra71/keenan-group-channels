"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  customerService,
  customerAddressService,
  subscriptionService,
} from "@/lib/store";
import { getStripeProvider } from "@/lib/stripe";

type Result = { success: boolean; error?: string };

export type AccountContact = {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
};

export type AddressInput = {
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  isDefaultBilling?: boolean;
  isDefaultShipping?: boolean;
};

function toAddressData(input: AddressInput) {
  return {
    firstName: input.firstName?.trim() || "",
    lastName: input.lastName?.trim() || "",
    company: input.company?.trim() || "",
    phone: input.phone?.trim() || "",
    address1: input.address1?.trim() || "",
    address2: input.address2?.trim() || "",
    city: input.city?.trim() || "",
    stateOrProvince: input.state?.trim() || "",
    postalCode: input.postalCode?.trim() || "",
    country: "Australia",
    countryCode: "AU",
    isDefaultBilling: Boolean(input.isDefaultBilling),
    isDefaultShipping: Boolean(input.isDefaultShipping),
  };
}

/** Edit the member's own profile (name, company, phone). Optional, non-blocking. */
export async function updateCustomerProfile(input: {
  firstName: string;
  lastName: string;
  company?: string;
  phone?: string;
}): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  if (!firstName || !lastName) {
    return { success: false, error: "First and last name are required." };
  }
  const company = input.company?.trim() || "";
  const phone = input.phone?.trim() || "";

  try {
    await customerService.update(session.customerId, { firstName, lastName, company, phone });

    // Best-effort: keep the Stripe customer in sync if they're a member.
    try {
      const subs = await subscriptionService.listForCustomer(session.customerId, CHANNEL_ID);
      const sub = subs.find((s) => s.status === "active" || s.status === "pending");
      if (sub?.stripeCustomerId) {
        const stripe = await getStripeProvider();
        await stripe.updateCustomer(sub.stripeCustomerId as string, {
          name: `${firstName} ${lastName}`.trim(),
          phone: phone || undefined,
        });
      }
    } catch (e) {
      console.error("[updateCustomerProfile] Stripe sync failed:", e);
    }

    revalidatePath("/account/profile");
    revalidatePath("/account/membership");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save" };
  }
}

export async function createCustomerAddress(input: AddressInput): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  if (!input.address1?.trim() || !input.city?.trim() || !input.postalCode?.trim()) {
    return { success: false, error: "Address, city and postcode are required." };
  }
  try {
    await customerAddressService.createForParent(session.customerId, toAddressData(input));
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to add address" };
  }
}

export async function updateCustomerAddress(id: number, input: AddressInput): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  try {
    // parent-scoped — validateBelongsToParent rejects another customer's address
    await customerAddressService.updateForParent(session.customerId, id, toAddressData(input));
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update address" };
  }
}

export async function deleteCustomerAddress(id: number): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  try {
    await customerAddressService.deleteForParent(session.customerId, id);
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete address" };
  }
}

export async function setDefaultAddress(
  id: number,
  type: "billing" | "shipping"
): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  try {
    // beforeUpdate clears the flag on the customer's other addresses.
    await customerAddressService.updateForParent(
      session.customerId,
      id,
      type === "billing" ? { isDefaultBilling: true } : { isDefaultShipping: true }
    );
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to set default" };
  }
}

/** Save the member's "people on the account" list into customer metafields. */
export async function updateAccountContacts(contacts: AccountContact[]): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  const cleaned = (Array.isArray(contacts) ? contacts : [])
    .map((c) => ({
      name: (c.name || "").trim(),
      email: (c.email || "").trim(),
      phone: (c.phone || "").trim(),
      role: (c.role || "").trim(),
    }))
    .filter((c) => c.name || c.email || c.phone || c.role);

  try {
    const customer = await customerService.getById(session.customerId);
    const metafields = {
      ...((customer?.metafields as Record<string, unknown>) || {}),
      account_contacts: cleaned,
    };
    await customerService.update(session.customerId, { metafields });
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save contacts" };
  }
}
