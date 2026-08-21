// ============================================================================
// "Is this customer's account set up?" — the PURE decision behind the prompt on
// /account/profile (card xqWftDcL).
//
// Three things the business wants on file for every customer: a phone number,
// a default BILLING address and a default SHIPPING address. One address ticked
// as both satisfies the two address items — that is already the norm (13,409 of
// the 15,008 saved addresses are default billing and 13,452 default shipping,
// prod 2026-08-11), so the prompt must never nag someone who has one address
// doing both jobs.
//
// NOTHING here blocks anything. No order is refused, no checkout gate reads it
// (Chris, 2026-08-11): it is a prompt on the customer's own details page, which
// is also how the 56% of contacts carrying no phone get asked for one — on
// their next visit, not by an email or a hard stop.
//
// The wording names the CONTROLS the customer must use ("Default billing",
// "Default shipping", the Phone box), because a prompt that describes a
// requirement without naming where to satisfy it is just an accusation.
// ============================================================================

export type MissingDetail = "phone" | "address" | "defaultBilling" | "defaultShipping";

export interface ProfileCompletenessInput {
  phone: string | null | undefined;
  addresses: readonly { isDefaultBilling: boolean; isDefaultShipping: boolean }[];
}

/**
 * What is still missing, in the order the page asks for it.
 *
 * With NO saved address at all the answer is the single `address` item rather
 * than both default flags: telling someone to tick two boxes on an address they
 * have not typed yet is a worse instruction than "add an address".
 */
export function missingProfileDetails(input: ProfileCompletenessInput): MissingDetail[] {
  const missing: MissingDetail[] = [];
  if (!(input.phone ?? "").trim()) missing.push("phone");

  const addresses = input.addresses ?? [];
  if (addresses.length === 0) {
    missing.push("address");
    return missing;
  }
  if (!addresses.some((a) => a.isDefaultBilling)) missing.push("defaultBilling");
  if (!addresses.some((a) => a.isDefaultShipping)) missing.push("defaultShipping");
  return missing;
}

/** True when nothing is outstanding — the prompt is not rendered at all. */
export function profileIsComplete(input: ProfileCompletenessInput): boolean {
  return missingProfileDetails(input).length === 0;
}

const LINES: Record<MissingDetail, string> = {
  phone: "Add a phone number, so we can reach you about an order or a delivery.",
  address:
    "Add an address. Your first one is saved as both your billing and shipping address, and you can change that any time.",
  defaultBilling: "Choose which address is your billing address — use “Set as default billing”.",
  defaultShipping:
    "Choose which address your orders are delivered to — use “Set as default shipping”.",
};

/** The customer-facing sentence for each outstanding item. */
export function profilePromptLines(missing: readonly MissingDetail[]): string[] {
  return missing.map((m) => LINES[m]);
}
