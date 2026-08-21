// ============================================================================
// The /account/profile page's own reads — PROJECTED, not `SELECT *`.
//
// This is a customer-facing page, so it loads only what it renders (card
// BIig1Zo1, now a standing rule in the Product Brief). The reason the rule is
// about the LOAD and not the render: what a server component ships to the
// browser depends on the framework and the build, so "we read the row but only
// print five fields" is a promise the page cannot keep on its own.
//
// The contact row is exactly the wrong row to read whole. It carries
// `password_hash`, the staff-written `notes`, `store_credit`, the net-terms
// entitlement (`net_term_enabled`, `net_term_credit`), `stripe_id` and the
// Zoey parity columns — none of which this page shows, and one of which is a
// credential. Projecting in SQL means a field never selected cannot be
// serialised by any framework in any build.
//
// Both reads answer null / [] rather than throwing: a details page is worth
// less than the account area it sits in.
// ============================================================================

import { getCommerceClient } from "@keenan/services";

export interface ProfileContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Contacts have no company column — it lives under attributes.company. */
  company: string;
}

export interface ProfileAddressRow {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
}

type ContactRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
};

type AddressRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_or_province: string | null;
  postal_code: string | null;
  is_default_billing: boolean | null;
  is_default_shipping: boolean | null;
};

/** The five fields the Profile card shows, and nothing else. */
export async function loadProfileContact(contactId: number): Promise<ProfileContact | null> {
  const sql = getCommerceClient();
  if (!sql) return null;
  try {
    const rows = await sql<ContactRow[]>`
      SELECT first_name, last_name, email, phone,
             COALESCE(attributes->>'company', '') AS company
      FROM contacts
      WHERE id = ${contactId}
      LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      firstName: r.first_name ?? "",
      lastName: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      company: r.company ?? "",
    };
  } catch (e) {
    console.error("[loadProfileContact] failed:", e);
    return null;
  }
}

/**
 * The address book, ordered exactly as `customerAddressService.listForContact`
 * ordered it (defaults first) with `id` added so two rows carrying the same
 * flags cannot swap places between renders.
 */
export async function loadProfileAddresses(contactId: number): Promise<ProfileAddressRow[]> {
  const sql = getCommerceClient();
  if (!sql) return [];
  try {
    const rows = await sql<AddressRow[]>`
      SELECT id, first_name, last_name, company, phone,
             address1, address2, city, state_or_province, postal_code,
             is_default_billing, is_default_shipping
      FROM customer_addresses
      WHERE contact_id = ${contactId}
      ORDER BY is_default_shipping DESC, is_default_billing DESC, id`;
    return rows.map((a) => ({
      id: a.id,
      firstName: a.first_name ?? "",
      lastName: a.last_name ?? "",
      company: a.company ?? "",
      phone: a.phone ?? "",
      address1: a.address1 ?? "",
      address2: a.address2 ?? "",
      city: a.city ?? "",
      state: a.state_or_province ?? "",
      postalCode: a.postal_code ?? "",
      isDefaultBilling: Boolean(a.is_default_billing),
      isDefaultShipping: Boolean(a.is_default_shipping),
    }));
  } catch (e) {
    console.error("[loadProfileAddresses] failed:", e);
    return [];
  }
}
