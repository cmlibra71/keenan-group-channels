import type { Metadata } from "next";
import {
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_APPLICATION_INTRO,
  FINANCE_ATTACHMENT_PROMPTS,
  FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
  financeApplicationFields,
} from "@keenan/services/finance";
import { FinanceApplicationForm } from "@/components/finance/FinanceApplicationForm";
import { financeApplyFundingTypes } from "@/lib/finance/product-finance";

// ============================================================================
// The SKOPE FUNDING application form (card 6f47rFeT, Steve 2026-08-20).
//
// Steve: "clicking on the SKOPE funding link that appears on the product page
// takes you to the Silverchef finance application page". It did — the product
// panel's Apply link was hardcoded to `/silverchef/apply` whatever funder had
// quoted the figure — so a Skope-funded fridge, shown at Skope's own 3.625%
// under a "Skope Funding" heading, handed the customer to SilverChef's
// application. A customer may never be handed to the wrong financier.
//
// So Skope Funding gets its own address and its own identity. This page is the
// SAME machinery as `/silverchef/apply` (same stored field contract, same
// server action, same filing and rep-notification ladder) with two deliberate
// differences:
//   1. It says Skope Funding, in its title, its heading and its copy.
//   2. It offers the funding types the checkout's `finance` button offers
//      (`financeApplyFundingTypes`) — Skope Funding and the traditional option
//      — and never SilverChef's own account types, so `silverchef_account_number`
//      can never be reached and is dropped from the list.
// The server re-applies (2) rather than trusting the browser.
//
// A CODED route, like `/silverchef/apply`: content pages live under
// `/pages/<slug>`, so this can never collide with a page staff author. There is
// no Skope INFORMATION page to link back to on either storefront today
// (Industry Kitchens' CMS `skope-finance` page is not on Chefs Depot), so the
// page carries no back-link rather than one that 404s on one of the two sites.
//
// `order_number` is dropped for the same reason as the SilverChef page: an
// application made before the equipment is chosen has no order to name.
// ============================================================================

export const metadata: Metadata = {
  title: "Apply for Skope Funding",
  description:
    "Apply for Skope Funding on Skope refrigeration. A few minutes to fill in, nothing is charged, and you are not committed to anything by applying.",
};

export default async function SkopeFundingApplyPage() {
  const allowed = financeApplyFundingTypes("skope");
  const fields = financeApplicationFields()
    .filter((f) => f.name !== "order_number" && f.name !== "silverchef_account_number")
    .map((f) => (f.name === "funding_type" ? { ...f, options: allowed } : f));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Skope Funding
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">Apply for Skope Funding</h1>
        <p className="mt-2 text-text-secondary">
          Fill this in and our team will be in touch. Nothing is charged and you are not committed to
          anything by applying. Skope Funding applies to Skope equipment; approval is subject to the
          finance company&apos;s own checks.
        </p>
      </header>

      <div className="mt-6">
        <FinanceApplicationForm
          fields={fields}
          intro={FINANCE_APPLICATION_INTRO}
          attachmentPrompts={[...FINANCE_ATTACHMENT_PROMPTS]}
          accountNumberTrigger={FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT}
          formKey={FINANCE_APPLICATION_FORM_KEY}
          funder="skope"
        />
      </div>
    </div>
  );
}
