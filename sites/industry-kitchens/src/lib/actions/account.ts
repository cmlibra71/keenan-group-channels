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
  countAddressesForContact,
  type ContactAddressData,
} from "@/lib/contact-addresses";
import { defaultsForNewAddress } from "@/lib/checkout/save-address";
import { getStripeProvider } from "@/lib/stripe";
import { getContactPermissions } from "@/lib/role-permissions";
import {
  mayManageAddressBook,
  addressAuthorityMessage,
  type AddressBookAction,
} from "@/lib/account/address-authority";
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
 * B2B account-role gate for the account address book. Accountless (B2C) contacts
 * bypass; the resolver fails open on DB error. Returns an error Result when
 * denied, else null. docs/crm-parity/10-role-enforcement.md
 *
 * Each action takes Zoey's BILL-TO code and the ship-to code together, because one
 * book serves both purposes here — see `lib/account/address-authority.ts` for why,
 * and card H5JdsMrC for the instruction ("Customers other than the manager shall
 * not be authorised to change delivery addresses"). Those codes are MAIN-CONTACT
 * -ONLY, so the resolver settles them on the role's scope and the membership's
 * main-contact flag rather than on the permissive absent-code default.
 *
 * Refused HERE, in the action — the page hides the controls as well, but a stale
 * form or a hand-posted call must not be able to walk past the rule.
 */
async function denyAddressAction(
  contactId: number,
  action: AddressBookAction,
  verb: "adding" | "editing" | "removing"
): Promise<Result | null> {
  const perms = await getContactPermissions(contactId);
  if (!mayManageAddressBook(perms, action)) {
    return { success: false, error: addressAuthorityMessage(verb) };
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

/**
 * Edit the member's own profile.
 *
 * First name, last name and PHONE are required; the business name is not (card
 * xqWftDcL: "Profile must have First name, Last name, Phone, Email — Business
 * name is NOT mandatory"). Phone became required here and NOWHERE else on
 * purpose: the sign-up form is unchanged, and no order is refused for want of a
 * phone number — 56% of contacts carry none (prod, 2026-08-11), so gating
 * checkout on it would refuse half our customers over a details page.
 */
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
  if (!phone) {
    return {
      success: false,
      error: "Please add a phone number, so we can reach you about an order or a delivery.",
    };
  }

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
  const denied = await denyAddressAction(session.contactId, "add", "adding");
  if (denied) return denied;
  try {
    const data = toAddressData(input);
    // A customer's FIRST address is their default billing AND shipping, ticks or
    // no ticks — the same rule checkout's "save this address" path already
    // applies (`defaultsForNewAddress`, card 18PbOwaG). Without it the very
    // first address someone saves here can land with neither flag, and the page
    // then asks them to set two defaults on the one address they just typed.
    // A LATER address only takes a default the customer ticked, so nothing they
    // already chose is displaced.
    const existing = await countAddressesForContact(session.contactId);
    if (existing === 0) {
      const first = defaultsForNewAddress(existing);
      data.isDefaultBilling = first.isDefaultBilling;
      data.isDefaultShipping = first.isDefaultShipping;
    }
    await createAddressForContact(session.contactId, data);
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
  const denied = await denyAddressAction(session.contactId, "edit", "editing");
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
  const denied = await denyAddressAction(session.contactId, "remove", "removing");
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
  const denied = await denyAddressAction(session.contactId, "edit", "editing");
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
    // The role resolver FAILS OPEN by design (a DB hiccup must never brick
    // checkout). That is the wrong trade here: without it we cannot tell whether
    // this person's list belongs to an account or to their own contact row, and
    // guessing "contact" would drop a manager's edit somewhere no colleague can
    // ever see, silently. Refuse and say so instead.
    if (previousView.permissionsUnavailable) {
      return {
        success: false,
        error: "We couldn't check your account just now, so nothing was saved. Please try again in a moment.",
      };
    }
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
      //
      // `updated_at` is deliberately NOT stamped: a customer tidying their own
      // contact list would otherwise jump their company to the top of every
      // staff list sorted by last-updated (same call as the 1kT6phnK backfill).
      await sql`
        UPDATE accounts
        SET metafields = COALESCE(metafields, '{}'::jsonb)
                       || jsonb_build_object('account_contacts', ${payload}::text::jsonb)
        WHERE id = ${accountId}`;
      // Retire this contact's own legacy copy in the same breath. The read path
      // falls back to the contact's list only while the account has none, so
      // leaving it behind means a customer who deletes everyone and saves gets
      // the old rows back on reload — the list would be un-emptyable.
      await sql`
        UPDATE contacts
        SET metafields = COALESCE(metafields, '{}'::jsonb) - 'account_contacts'
        WHERE id = ${session.contactId}
          AND metafields ? 'account_contacts'`;
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
