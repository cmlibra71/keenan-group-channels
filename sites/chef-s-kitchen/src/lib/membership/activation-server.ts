// ============================================================================
// Reading a membership activation link. Card pktBo874.
//
// The page this feeds is PREFILLED (Tim's screenshot: "Membership activation page - prefilled
// asking for new password"), which is the whole reason `peekToken` exists: tokens are consumed on
// explicit submit, never on a GET, so an email link-scanner opening the page cannot burn it.
// ============================================================================

import {
  CHANNEL_ID,
  contactService,
  customerAddressService,
  customerAuthTokenService,
  orderShippingAddressService,
  getActiveSubscriptionForContact,
} from "@/lib/store";
import type { ActivationAddress, ActivationPrefill } from "./activation";

interface ActivationPayload {
  plan_slug?: string | null;
  order_id?: number | null;
  order_number?: string | null;
}

export interface ActivationContext {
  prefill: ActivationPrefill;
  planSlug: string | null;
  orderNumber: string | null;
  /** True when the person has already paid for a membership — the page says so and stops. */
  alreadyMember: boolean;
}

function addressFromRow(row: Record<string, unknown> | null | undefined): ActivationAddress | null {
  if (!row) return null;
  const address1 = String(row.address1 ?? "").trim();
  if (!address1) return null;
  return {
    address1,
    address2: String(row.address2 ?? "").trim(),
    city: String(row.city ?? "").trim(),
    state: String(row.state_or_province_code ?? row.state_or_province ?? "").trim(),
    postalCode: String(row.postal_code ?? "").trim(),
  };
}

/**
 * Resolve a token into everything the activation page draws. Returns null for a link that is
 * wrong, spent or expired — the page shows one plain sentence for all three, because telling a
 * reader WHICH is an oracle about other people's tokens.
 */
export async function readActivation(token: string): Promise<ActivationContext | null> {
  if (!token) return null;
  const peeked = await customerAuthTokenService
    .peekToken(token, "membership_activation")
    .catch(() => null);
  if (!peeked || peeked.contactId == null) return null;

  const contactId = peeked.contactId;
  const payload = (peeked.payload ?? {}) as ActivationPayload;

  const contact = (await contactService.getById(contactId).catch(() => null)) as
    | {
        email: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        password_hash: string | null;
        metafields: Record<string, unknown> | null;
      }
    | null;
  if (!contact) return null;

  const metafields = contact.metafields ?? {};

  // Already paid for a membership? Then the link has nothing left to do, and offering to "join"
  // again is how somebody ends up with two subscriptions.
  const activeSub = await getActiveSubscriptionForContact(contactId).catch(() => null);

  // The address the page shows back. Their own book first — it is what they will keep using —
  // then the address on the order the join rode in on, so a brand-new guest still sees the
  // address they typed twenty seconds ago rather than five empty boxes.
  let address: ActivationAddress | null = null;
  try {
    const rows = (await customerAddressService.listForContact(contactId)) as Record<string, unknown>[];
    address = addressFromRow(rows.find((r) => r.is_default_billing) ?? rows[0]);
  } catch {
    address = null;
  }
  if (!address && payload.order_id) {
    try {
      const result = (await orderShippingAddressService.listForParent(payload.order_id, {
        page: 1,
        limit: 1,
        sort: "id",
        direction: "asc",
        filters: {},
        includes: [],
      })) as { data?: Record<string, unknown>[] };
      address = addressFromRow(result?.data?.[0]);
    } catch {
      address = null;
    }
  }

  return {
    prefill: {
      contactId,
      email: contact.email,
      firstName: (contact.first_name ?? "").trim(),
      lastName: (contact.last_name ?? "").trim(),
      phone: (contact.phone ?? String(metafields.checkout_phone ?? "")).trim(),
      dateOfBirth: String(metafields.date_of_birth ?? "").trim(),
      hasPassword: !!contact.password_hash,
      address,
    },
    planSlug: payload.plan_slug ?? null,
    orderNumber: payload.order_number ?? null,
    alreadyMember: !!activeSub,
  };
}

/** The channel this module is bound to — exported so callers cannot pass a different one. */
export const ACTIVATION_CHANNEL_ID = CHANNEL_ID;
