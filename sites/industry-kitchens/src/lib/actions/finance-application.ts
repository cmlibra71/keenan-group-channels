"use server";

import { headers } from "next/headers";
import {
  financeApplicationFields,
  parseFieldDefs,
  validateSubmissionPayload,
  FINANCE_APPLICATION_FORM_KEY,
  FUNDING_TYPES,
} from "@keenan/services/services";
import { fileFinanceApplication } from "@/lib/checkout/finance-application";
import { financeApplicationForm } from "@/lib/checkout/finance-form";
import { SILVERCHEF_METHOD_ID, FINANCE_METHOD_ID } from "@keenan/services/finance";
import { slidingWindowAllow } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth";
import { resolveAccountOptions } from "@/lib/checkout/account-options";

// ============================================================================
// Applying for finance from the SilverChef page (card 6f47rFeT).
//
// The product page's "Apply for Finance" has to open a form that actually
// files an application. That machinery already exists for the checkout
// (VAjaPj0t): the same stored field contract, the same submission row, the
// same rep-else-cs@ notification. This is the SAME call with no order attached
// — deliberately not a second copy of it, because a second copy is a second
// place to forget the rep ladder.
//
// The one thing the checkout gets for free and a public page does not is a
// human on the other end, so the spam gates from `lib/actions/forms.ts` are
// repeated here: honeypot, dwell time, and the same per-IP sliding windows.
// ============================================================================

export interface FinanceApplicationSubmitResult {
  success: boolean;
  error?: string;
  /** True when the application was filed AND somebody was told about it. */
  notified?: boolean;
}

const FUNDING_TYPE_LABELS = FUNDING_TYPES.map((t) => t.label);

export async function submitFinanceApplication(input: {
  /** Answers keyed by the form's own field names (no `finance_` prefix). */
  values: Record<string, string>;
  uploadToken?: string | null;
  /** Honeypot — a real person leaves this empty. */
  hp?: string;
  /** Client mount timestamp (ms) for the dwell check. */
  t?: number;
}): Promise<FinanceApplicationSubmitResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim() || "unknown";

  // A caught bot is told it worked, never why it failed.
  if (input.hp && String(input.hp).trim() !== "") return { success: true };
  if (typeof input.t === "number" && input.t > 0 && Date.now() - input.t < 2000) return { success: true };

  if (
    !slidingWindowAllow(`form:${FINANCE_APPLICATION_FORM_KEY}:${ip}`, { windowMs: 60_000, max: 3 }) ||
    !slidingWindowAllow(`form-hr:${FINANCE_APPLICATION_FORM_KEY}:${ip}`, { windowMs: 3_600_000, max: 20 })
  )
    return { success: false, error: "Too many submissions — please try again shortly." };

  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.values ?? {})) {
    if (typeof value === "string") values[name] = value.trim();
  }
  if (JSON.stringify(values).length > 20_000)
    return { success: false, error: "That application is too long to send." };

  // The funding type must be one the business actually offers. There is no
  // basket here, so — unlike the checkout — no button narrows the list and no
  // SKOPE-only test applies: a person applying from the SilverChef page has not
  // chosen their equipment yet.
  const fundingType = values.funding_type ?? "";
  if (fundingType && !FUNDING_TYPE_LABELS.includes(fundingType))
    return { success: false, error: "Please choose a funding type from the list." };

  // The STORED field contract is the authority on a complete application — the
  // same list the checkout validates against, read from the database when staff
  // have edited it. `order_number` is ours and is never asked of a customer.
  const storedForm = await financeApplicationForm();
  const stored = parseFieldDefs(storedForm?.fields);
  const fields = (stored.length ? stored : financeApplicationFields()).filter(
    (f) => f.name !== "order_number"
  );
  const validation = validateSubmissionPayload(fields, values);
  if (!validation.ok) return { success: false, error: validation.error };

  // Signed in with a B2B account? Their own rep is the one who should hear
  // about it; everyone else falls through to cs@ this site's domain.
  let accountId: number | null = null;
  try {
    const session = await getSession();
    // The same resolver the checkout uses, so "which account is this person on"
    // has one answer. A failure here only costs the rep a direct notification —
    // cs@ still gets it — so it is swallowed rather than raised at the customer.
    accountId = session ? ((await resolveAccountOptions(session))?.accountId ?? null) : null;
  } catch {
    accountId = null;
  }

  const filed = await fileFinanceApplication({
    // No order: this application comes before the equipment is chosen.
    paymentMethod: isSkopeFunding(fundingType) ? FINANCE_METHOD_ID : SILVERCHEF_METHOD_ID,
    // Where the application was actually filled in, so a staff member reading
    // the enquiry can tell a pre-purchase application from a checkout one.
    pagePath: "/silverchef/apply",
    values,
    uploadToken: input.uploadToken ?? null,
    accountId,
    replyTo: values.email || null,
  });

  if (filed.error && !filed.notified.length)
    return { success: false, error: "Sorry — we couldn't send that. Please try again or call us." };

  return { success: true, notified: filed.notified.length > 0 };
}

/** Which funder the chosen funding type belongs to — the staff email says so. */
function isSkopeFunding(label: string): boolean {
  return FUNDING_TYPES.some((t) => t.label === label && t.method === FINANCE_METHOD_ID);
}
