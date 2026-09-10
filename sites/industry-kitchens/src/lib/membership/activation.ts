/**
 * The membership ACTIVATION journey — the pure half. Card pktBo874.
 *
 * Tim's storyboard, after the emailed link: a prefilled page asking for a new password
 * ("Account details"), a details check ("Address details"), an optional birthday
 * ("Membership details"), then the customer is all set.
 *
 * Two rules this module exists to hold:
 *
 * 1. **The token never sets a password on a contact that already has one.** The link is minted
 *    from an address somebody typed at a checkout. It is emailed to that address, so it cannot
 *    leak — but a token that could overwrite an existing password would make the checkout a second
 *    password-reset channel, with a seven-day life and none of the reset flow's rate limits.
 *    Somebody who already has an account signs in instead; the join is waiting for them.
 * 2. **The password rule is the site's ONE rule** (`validatePasswordStrength`, shared with
 *    register / reset / change and with the portal). Myer's screenshot lists a different rule —
 *    eight characters, an uppercase, a lowercase and a number — and copying it would put a second
 *    password policy on the site, which is a defect, not parity.
 */

import { validatePasswordStrength } from "@keenan/services/password-policy";
import { normaliseAuState } from "../checkout/au-address";

/** The three numbered steps, in Tim's order. */
export const ACTIVATION_STEPS = ["account", "address", "membership"] as const;
export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export const ACTIVATION_STEP_TITLES: Record<ActivationStep, string> = {
  account: "Account details",
  address: "Address details",
  membership: "Membership details",
};

/** What the activation page was handed by the token, once the server has resolved it. */
export interface ActivationPrefill {
  contactId: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  /** True when this person already has a password — step 1 asks them to sign in instead. */
  hasPassword: boolean;
  address: ActivationAddress | null;
}

export interface ActivationAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
}

/** One line of address, the way Tim's screenshot shows it back: "14 East Ct, LILYDALE, VIC 3140". */
export function formatAddressLine(address: ActivationAddress | null | undefined): string {
  if (!address) return "";
  const parts = [
    [address.address1, address.address2].filter(Boolean).join(" "),
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(" "),
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

export interface AccountStepInput {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  hasPassword: boolean;
}

/**
 * Validate step 1. Returns an error sentence, or null.
 *
 * A contact that already has a password does NOT get to set one here (rule 1 above) — the page
 * shows them a sign-in link instead, and this refuses the post if a form reaches the action anyway.
 */
export function validateAccountStep(input: AccountStepInput): string | null {
  if (input.hasPassword) {
    return "You already have an account with this email. Please sign in to finish joining.";
  }
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return "Please enter your first and last name.";
  }
  const weak = validatePasswordStrength(input.password);
  if (weak) return weak;
  if (input.password !== input.confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

/**
 * Validate step 2 and hand back the address in the shape the address book stores.
 *
 * The same Australian rules the checkout enforces, deliberately: this writes the member's DEFAULT
 * BILLING address, which is then offered back at the next checkout, and a junk state matches no
 * freight zone. No fallback to the raw value — the checkout's rule, for the checkout's reason.
 */
export function validateAddressStep(input: {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
}): { error: string } | { address: ActivationAddress } {
  const address1 = (input.address1 || "").trim();
  const city = (input.city || "").trim();
  const postalCode = (input.postalCode || "").trim();
  if (!address1) return { error: "Please enter your street address." };
  if (!city) return { error: "Please enter your suburb or city." };

  const state = normaliseAuState(input.state || "");
  if (!state) return { error: "Please choose an Australian state or territory." };
  if (!/^\d{4}$/.test(postalCode)) {
    return { error: "Australian postcodes are 4 digits, e.g. 3140." };
  }

  return {
    address: {
      address1,
      address2: (input.address2 || "").trim(),
      city,
      state,
      postalCode,
    },
  };
}
