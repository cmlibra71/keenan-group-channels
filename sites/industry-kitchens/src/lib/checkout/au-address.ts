// ============================================================================
// Australian address rules — the one definition of "what is a valid AU state
// and postcode" for checkout.
//
// The billing form used to take a free-text State and an unconstrained Postal
// Code, so orders arrived with values like "North Eastern Australia" /
// "1616846841". A junk postcode matches no shipping zone, which silently priced
// freight at $0 — a real money leak, not just bad data. Both halves (the form
// and the server action that accepts the form) validate through here so what we
// SHOW is exactly what we ACCEPT.
//
// Non-AU countries keep the free-text field: we have no region list for them and
// the shipping rate cards are AU-postcode based anyway.
// ============================================================================

export type AuState = {
  /** Canonical abbreviation stored on the order (e.g. "VIC"). */
  code: string;
  /** Full name shown in the dropdown. */
  name: string;
};

/** The 8 Australian states and territories, in the conventional order. */
export const AU_STATES: AuState[] = [
  { code: "NSW", name: "New South Wales" },
  { code: "VIC", name: "Victoria" },
  { code: "QLD", name: "Queensland" },
  { code: "SA", name: "South Australia" },
  { code: "WA", name: "Western Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "NT", name: "Northern Territory" },
  { code: "ACT", name: "Australian Capital Territory" },
];

const BY_NAME = new Map<string, string>(
  AU_STATES.flatMap((s) => [
    [s.code.toLowerCase(), s.code],
    [s.name.toLowerCase(), s.code],
  ])
);

/**
 * Normalise whatever a saved address / Google Places autocomplete hands us to a
 * canonical state code. Returns null when the value isn't a recognisable
 * Australian state (legacy rows carry free-text junk) — callers decide whether
 * to fall back to the raw value or reject.
 */
export function normaliseAuState(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return BY_NAME.get(trimmed.toLowerCase()) ?? null;
}

/** Australian postcodes are exactly four digits. */
export function isValidAuPostcode(value: string | null | undefined): boolean {
  return /^\d{4}$/.test((value ?? "").trim());
}
