// ============================================================================
// Storefront contact identity helpers (identity unification).
//
// `contacts` is THE person: accountless rows (account_id IS NULL) are storefront
// shoppers, account-linked rows are B2B people. Login/register/reset flows
// resolve their subject via contactService.findLoginCandidate; REGISTRATION
// creates an accountless contact for THIS channel.
//
// Creation is a raw postgres.js INSERT (not contactService.create) on purpose:
// the service's (account_id, email) unique validation treats account_id NULL as
// "match other NULL rows" REGARDLESS of channel, so a legitimate second
// registration of the same email on a DIFFERENT storefront would be rejected.
// The DB's partial unique index — (coalesce(origin_channel_id,0), lower(email))
// WHERE account_id IS NULL — is the real invariant, and the insert relies on it:
// a 23505 here means the accountless slot for (channel, email) is taken (a
// register race), surfaced as EmailTakenError so callers return their neutral
// "taken" copy. Raw postgres.js (not Drizzle) matches lib/store.ts's
// getSitemapProducts pattern — the dual drizzle-orm install inside
// @keenan/services is structurally incompatible with the root one.
// ============================================================================

import { getCommerceClient, hashPasswordForStorage } from "@keenan/services";
import type { JSONValue } from "postgres";
import { CHANNEL_ID } from "./channel";

// postgres.js types sql.json's parameter as its recursive JSONValue, which
// Record<string, unknown> doesn't structurally satisfy — the runtime just
// JSON.stringifies, so a plain object bag is safe to cast.
const asJson = (v: Record<string, unknown>): JSONValue => v as unknown as JSONValue;

/** Snake_case contact row shape as returned by contactService.findLoginCandidate. */
export type LoginCandidate = {
  id: number;
  account_id: number | null;
  email: string;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
  attributes: Record<string, unknown> | null;
  metafields: Record<string, unknown> | null;
};

/** The accountless (channel, email) slot is already taken — a register race. */
export class EmailTakenError extends Error {
  constructor() {
    super("Email is not available for this channel.");
    this.name = "EmailTakenError";
  }
}

export type CreateAccountlessContactInput = {
  email: string;
  /** Plaintext — hashed to bcrypt here. Omit for passwordless (Google) contacts. */
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  attributes?: Record<string, unknown>;
  metafields?: Record<string, unknown>;
};

export type CreatedContact = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

/**
 * Create the accountless contact for (THIS channel, email) — the storefront
 * person. Throws EmailTakenError when the partial-unique slot is occupied
 * (concurrent registration); callers must have pre-checked availability with
 * contactService.isEmailAvailableForChannel for the enumeration-safe path.
 */
export async function createAccountlessContact(
  input: CreateAccountlessContactInput
): Promise<CreatedContact> {
  const sql = getCommerceClient();
  if (!sql) throw new Error("Commerce database is not initialised.");

  const passwordHash = input.password ? await hashPasswordForStorage(input.password) : null;

  try {
    const [row] = await sql<
      { id: number; email: string; first_name: string | null; last_name: string | null }[]
    >`
      INSERT INTO contacts (
        account_id, origin_channel_id, email, password_hash,
        first_name, last_name, is_active, attributes, metafields
      ) VALUES (
        NULL, ${CHANNEL_ID}, ${input.email}, ${passwordHash},
        ${input.firstName ?? null}, ${input.lastName ?? null}, true,
        ${sql.json(asJson(input.attributes ?? {}))}, ${sql.json(asJson(input.metafields ?? {}))}
      )
      RETURNING id, email, first_name, last_name`;
    return row;
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") throw new EmailTakenError();
    throw e;
  }
}

/**
 * Merge a metafields patch into a contact's existing metafields (read-modify-
 * write — never clobbers keys the patch doesn't mention). Used to stamp
 * email_verified=true when ownership is proven (Google sign-in, activation).
 */
export async function mergeContactMetafields(
  contactId: number,
  patch: Record<string, unknown>
): Promise<void> {
  const sql = getCommerceClient();
  if (!sql) throw new Error("Commerce database is not initialised.");
  // jsonb || merges top-level keys atomically (no read-modify-write race).
  await sql`
    UPDATE contacts
    SET metafields = coalesce(metafields, '{}'::jsonb) || ${sql.json(asJson(patch))},
        updated_at = now()
    WHERE id = ${contactId}`;
}
