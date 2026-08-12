// Should we ask the server whether this checkout email already has an account?
//
// Pure, so the rule is testable without a DB or a session: the checkout form
// probes as the shopper types, and each probe is a lookup of somebody else's
// email address. Everything decidable on the client — is it even an email, is
// the shopper already signed in, did we already ask about this address — is
// decided here, so the only queries that reach the server are the ones that
// could plausibly matter.

/** Trim + lower-case, the same normalisation login/register apply before lookup. */
export function normaliseEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

// Deliberately loose: this gates a "did you mean to sign in?" hint, not a
// submission. `<input type="email">` does the real validation.
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export function looksLikeEmail(raw: string | null | undefined): boolean {
  return EMAIL_SHAPE.test(normaliseEmail(raw));
}

export type ProbeDecision =
  /** Show no prompt and ask nothing. */
  | { action: "skip" }
  /** We already know the answer for this address — reuse it, ask nothing. */
  | { action: "known"; hasAccount: boolean }
  /** Ask the server about this (normalised) address. */
  | { action: "ask"; email: string };

/**
 * What to do about the address currently in the email field.
 *
 * `known` is the answers-so-far cache: keeping it means editing an address and
 * typing it back shows the prompt again without a second lookup, and a keystroke
 * storm costs one query per DISTINCT address rather than one per keystroke.
 */
export function decideEmailProbe(input: {
  email: string | null | undefined;
  isSignedIn: boolean;
  known: ReadonlyMap<string, boolean>;
}): ProbeDecision {
  if (input.isSignedIn) return { action: "skip" };
  const email = normaliseEmail(input.email);
  if (!looksLikeEmail(email)) return { action: "skip" };
  const cached = input.known.get(email);
  if (cached !== undefined) return { action: "known", hasAccount: cached };
  return { action: "ask", email };
}
