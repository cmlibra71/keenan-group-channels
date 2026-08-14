import "server-only";

import { CHANNEL_ID } from "@/lib/store";
import { ensureFinanceApplicationForm } from "@keenan/services/services";

// ============================================================================
// The finance application form, read once per minute instead of once per render
// (card VAjaPj0t).
//
// `ensureFinanceApplicationForm` is a create-only provisioning call: it looks
// the `finance-application` form up by key and inserts it if it is missing. It
// was being awaited on EVERY eligible checkout render and twice more per finance
// order — three round trips on the critical path for a row that changes only
// when a staff member edits the form. "Speed is a stakeholder-visible feature"
// (Product Brief §3); Tim called out slow pages on the demo.
//
// So: one in-flight promise shared by every concurrent caller, and the result
// held for TTL_MS. Short deliberately — the stored fields ARE the server-side
// validation contract, so a staff edit has to take effect quickly rather than at
// the next deploy. A failure is never cached and never thrown: a checkout must
// not fail because a form row couldn't be read, and the caller falls back to the
// shipped field definition.
// ============================================================================

const TTL_MS = 60_000;

type FinanceForm = { fields?: unknown } | null;

let cached: { at: number; value: FinanceForm } | null = null;
let inFlight: Promise<FinanceForm> | null = null;

/** Force the next read to hit the database (used by tests and after a form edit). */
export function resetFinanceApplicationFormCache(): void {
  cached = null;
  inFlight = null;
}

/**
 * The stored finance-application form, provisioning it on first use. Never
 * throws — returns null when it could not be read, and the caller uses the
 * shipped `financeApplicationFields()` definition instead.
 */
export function financeApplicationForm(): Promise<FinanceForm> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.value);
  if (inFlight) return inFlight;

  inFlight = (ensureFinanceApplicationForm(CHANNEL_ID) as Promise<FinanceForm>)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .catch((e) => {
      // Not cached: a transient failure must not stick for a minute.
      console.error("[checkout] finance application form not provisioned:", e);
      return null;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
