"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  CHANNEL_ID,
  contactService,
  subscriptionService,
} from "@/lib/store";
import {
  createAddressForContact,
  updateAddressForContact,
  deleteAddressForContact,
  setAddressDefaultForContact,
  type ContactAddressData,
} from "@/lib/contact-addresses";
import { getStripeProvider } from "@/lib/stripe";
import { getContactPermissions } from "@/lib/role-permissions";
import { normaliseAuState, isValidAuPostcode } from "@/lib/checkout/au-address";
import { getCommerceClient } from "@keenan/services";
import {
  normalisePeople,
  validatePeople,
  newlyAddedPeople,
  type AccountPerson,
} from "@/lib/account/account-people";
import {
  loadAccountPeople,
  loadAccountRoles,
  resolveAccountNotifyRecipients,
} from "@/lib/account/account-people-data";
import { sendAddedPeopleEmail } from "@/lib/account/people-email";

type Result = { success: boolean; error?: string };

/**
 * B2B account-role gate for the account address book (Zoey's
 * add/edit/remove_bill_to_address). Accountless (B2C) contacts bypass; the
 * resolver fails open on DB error. Returns an error Result when denied, else null.
 * docs/crm-parity/10-role-enforcement.md
 *
 * NOTE: Zoey offers these three codes only to MAIN CONTACT roles. `account_roles`
 * has no `scope` column yet, so we enforce the code alone — requiring
 * `is_main_contact` as well would lock existing members out of their own address
 * book on day one. Add `&& perms.isMainContact` once `scope` lands.
 */
async function denyAddressAction(
  contactId: number,
  code: "add_bill_to_address" | "edit_bill_to_address" | "remove_bill_to_address",
  verb: string
): Promise<Result | null> {
  const perms = await getContactPermissions(contactId);
  if (perms.isB2B && !perms.can(code)) {
    return {
      success: false,
      error: `Your role on this account doesn't allow ${verb} addresses. Ask your account administrator.`,
    };
  }
  return null;
}

/** @deprecated The free-text shape the first "people on the account" build stored.
 *  Read (never written) by `normalisePerson` so old rows still show. */
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

function toAddressData(input: AddressInput): ContactAddressData {
  return {
    firstName: input.firstName?.trim() || "",
    lastName: input.lastName?.trim() || "",
    company: input.company?.trim() || "",
    phone: input.phone?.trim() || "",
    address1: input.address1?.trim() || "",
    address2: input.address2?.trim() || "",
    city: input.city?.trim() || "",
    // Canonical state code — the form is a dropdown, but never trust the client.
    stateOrProvince: normaliseAuState(input.state) ?? "",
    postalCode: input.postalCode?.trim() || "",
    country: "Australia",
    countryCode: "AU",
    isDefaultBilling: Boolean(input.isDefaultBilling),
    isDefaultShipping: Boolean(input.isDefaultShipping),
  };
}

/**
 * The address book stores AUSTRALIAN addresses only (toAddressData hard-codes
 * AU), and these addresses are offered at checkout — so a free-text state or a
 * junk postcode saved here becomes an order we can't price for freight. Same
 * rules as placeOrder, enforced server-side. Returns an error Result, or null.
 */
function invalidAuAddress(input: AddressInput): Result | null {
  if (!input.address1?.trim() || !input.city?.trim() || !input.postalCode?.trim()) {
    return { success: false, error: "Address, city and postcode are required." };
  }
  if (!normaliseAuState(input.state)) {
    return {
      success: false,
      error: "Please select an Australian state or territory from the list.",
    };
  }
  if (!isValidAuPostcode(input.postalCode)) {
    return { success: false, error: "Please enter a valid 4-digit Australian postcode." };
  }
  return null;
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
    // Contacts have no company column (identity unification) — company lives
    // under attributes.company; merge so other attribute keys are preserved.
    const contact = await contactService.getById(session.contactId);
    const attributes = {
      ...((contact?.attributes as Record<string, unknown>) || {}),
      company,
    };
    await contactService.update(session.contactId, { firstName, lastName, phone, attributes });

    // Best-effort: keep the Stripe customer in sync if they're a member.
    try {
      const subs = await subscriptionService.listForContact(session.contactId, CHANNEL_ID);
      const sub = subs.find((s) => s.status === "active" || s.status === "pending");
      if (sub?.stripe_customer_id) {
        const stripe = await getStripeProvider();
        await stripe.updateCustomer(sub.stripe_customer_id as string, {
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
  const invalid = invalidAuAddress(input);
  if (invalid) return invalid;
  const denied = await denyAddressAction(session.contactId, "add_bill_to_address", "adding");
  if (denied) return denied;
  try {
    await createAddressForContact(session.contactId, toAddressData(input));
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to add address" };
  }
}

export async function updateCustomerAddress(id: number, input: AddressInput): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  const invalid = invalidAuAddress(input);
  if (invalid) return invalid;
  const denied = await denyAddressAction(session.contactId, "edit_bill_to_address", "editing");
  if (denied) return denied;
  try {
    // contact-scoped — the WHERE contact_id guard rejects another contact's address
    await updateAddressForContact(session.contactId, id, toAddressData(input));
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update address" };
  }
}

export async function deleteCustomerAddress(id: number): Promise<Result> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };
  const denied = await denyAddressAction(session.contactId, "remove_bill_to_address", "removing");
  if (denied) return denied;
  try {
    await deleteAddressForContact(session.contactId, id);
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
  const denied = await denyAddressAction(session.contactId, "edit_bill_to_address", "editing");
  if (denied) return denied;
  try {
    // Clears the flag on the contact's other addresses, then sets this one.
    await setAddressDefaultForContact(session.contactId, id, type);
    revalidatePath("/account/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to set default" };
  }
}

/**
 * Save "people on the account" (card 8LfB0DZS, xqWftDcL).
 *
 * Three things this does that the first build did not:
 *  1. It RETURNS the saved list. The screen then renders what the database now
 *     holds instead of the boxes the customer typed into, which is Steve's
 *     "after saved - info still showing".
 *  2. For a person on a business account it stores the list on the ACCOUNT, so
 *     the manager and every colleague see the same people. The old build wrote
 *     each person's list onto their own contact row, where nobody else could
 *     ever see it.
 *  3. It emails the account manager about anyone newly added, naming their
 *     access level, and tells the saver who was told.
 *
 * The role is validated against the live `account_roles` list server-side — a
 * posted role id that isn't a real, non-retired role is refused.
 */
export async function saveAccountPeople(people: AccountPerson[]): Promise<{
  success: boolean;
  error?: string;
  /** The list as stored — what the screen should now show. */
  people?: AccountPerson[];
  /** Names of the people we told about an addition; empty when there was nobody to tell. */
  notified?: string[];
}> {
  const session = await getSession();
  if (!session) return { success: false, error: "Not authenticated" };

  try {
    const roles = await loadAccountRoles();
    const roleIndex = roles.map((r) => ({ id: r.id, name: r.name }));
    const cleaned = normalisePeople(people, roleIndex);

    const invalid = validatePeople(cleaned, roleIndex);
    if (invalid) return { success: false, error: invalid };

    // ONE definition of who may edit, shared with the page (Zoey gives this to
    // the main-contact roles). A refusal is enforced here, not only in the UI:
    // a stale page must not be able to write the list.
    const previousView = await loadAccountPeople(session.contactId);
    if (!previousView.canEdit) {
      return {
        success: false,
        error:
          previousView.cannotEditReason ??
          "Your role on this account doesn't allow changing who is on it.",
      };
    }
    const accountId = previousView.accountId;
    const previous = previousView.people;

    const payload = JSON.stringify(cleaned);
    const sql = getCommerceClient();
    if (accountId !== null) {
      if (!sql) throw new Error("Commerce database is not initialised.");
      // ::text::jsonb — a bare ::jsonb cast on a bound string stores a JSON
      // *scalar* under prepare:false (postgres_jsonb_text_cast).
      await sql`
        UPDATE accounts
        SET metafields = COALESCE(metafields, '{}'::jsonb)
                       || jsonb_build_object('account_contacts', ${payload}::text::jsonb),
            updated_at = NOW()
        WHERE id = ${accountId}`;
    } else {
      const contact = await contactService.getById(session.contactId);
      const metafields = {
        ...((contact?.metafields as Record<string, unknown>) || {}),
        account_contacts: cleaned,
      };
      await contactService.update(session.contactId, { metafields });
    }

    // Best effort from here on: the list is saved, so nothing below may fail it.
    let notified: string[] = [];
    const added = newlyAddedPeople(previous, cleaned);
    if (added.length > 0 && accountId !== null) {
      try {
        const recipients = await resolveAccountNotifyRecipients(accountId, session.contactId);
        const me = previousView.members.find((m) => m.isYou);
        const sent = await sendAddedPeopleEmail({
          to: recipients,
          accountName: previousView.accountName,
          addedBy: me?.name || session.email,
          added: added.map((person) => ({
            person,
            role: roles.find((r) => r.id === person.roleId) ?? null,
          })),
        });
        if (sent.length > 0) notified = recipients.map((r) => r.name);
      } catch (e) {
        console.error("[saveAccountPeople] manager notification failed (save kept):", e);
      }
    }

    revalidatePath("/account/profile");
    return { success: true, people: cleaned, notified };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save people" };
  }
}
