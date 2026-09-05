import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FINANCE_APPLICATION_FORM_KEY,
  FINANCE_APPLICATION_INTRO,
  FINANCE_ATTACHMENT_PROMPTS,
  FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT,
  financeApplicationFields,
} from "@keenan/services/finance";
import { FinanceApplicationForm } from "@/components/finance/FinanceApplicationForm";
import { FinanceApplyLogo } from "@/components/finance/FinanceApplyLogo";
import { ensureFinanceApplyPage, FINANCE_APPLY_SLUGS } from "@keenan/services/services";
import { CHANNEL_ID } from "@/lib/channel";
import { getCmsPage } from "@/lib/store";

// ============================================================================
// The finance application form (card 6f47rFeT).
//
// A CODED route, deliberately, and deliberately NOT a content-page slug. The
// "Apply for Finance" button on every product page links straight here (Steve's
// card: the button opens the finance form), so it has to exist on BOTH
// storefronts and it has to exist whether that site's SilverChef information
// page is the CMS one (Industry Kitchens) or the coded fallback (Chefs Depot).
// `/pages/<slug>` belongs to the CMS and a CMS document cannot carry a form;
// `/silverchef/apply` can never be a page slug, so the two can never collide.
//
// THE QUESTIONS ARE NOT WRITTEN HERE — they are rendered from the stored field
// contract (`financeApplicationFields`, card VAjaPj0t), the same list the server
// validates against and the same list the checkout panel renders. A question
// added in the portal appears here without a deploy, and the form on screen can
// never ask for something the server rejects.
//
// `order_number` is dropped: an application made before the equipment is chosen
// has no order to name, and the field is optional in the stored contract.
//
// This is SILVERCHEF's application. A SKOPE-funded product quotes Skope's own
// factor under a "Skope Funding" heading and opens `/skope-funding/apply`
// instead (Steve, 2026-08-20) — a customer may never be handed to the wrong
// financier. This page keeps the whole funding-type list, because somebody
// applying before they have chosen equipment has not ruled anything out.
// ============================================================================

export const metadata: Metadata = {
  title: "Apply for equipment finance",
  description:
    "Apply for SilverChef Rent-Try-Buy equipment finance. A few minutes to fill in, nothing is charged, and you are not committed to anything by applying.",
};

// ── CMS-page resolver (Chris, 2026-08-25) ────────────────────────────────────
// The channel's own PUBLISHED CMS page wins, exactly as /silverchef resolves:
// this route seeds a draft copy of itself into the CMS on first visit
// (create-only — staff edits are never overwritten), and the moment staff
// publish it, this coded body retires itself behind a redirect. Until then the
// coded page serves, so the product panel's Apply link always has a
// destination. The coded URL stays forever; only the body moves to the CMS.
let seedOnce: Promise<unknown> | null = null;
function seedCmsPage() {
  seedOnce ??= ensureFinanceApplyPage(CHANNEL_ID, "silverchef").catch((e) => {
    seedOnce = null; // retry on the next visit — seeding must never cost the page
    console.error("[silverchef/apply] CMS page seeding failed:", e);
  });
}

export default async function FinanceApplyPage() {
  seedCmsPage();
  const cms = await getCmsPage(FINANCE_APPLY_SLUGS.silverchef).catch(() => null);
  if (cms) redirect(`/pages/${FINANCE_APPLY_SLUGS.silverchef}`);

  const fields = financeApplicationFields().filter((f) => f.name !== "order_number");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <header>
        {/* SilverChef's own mark, from the file Steve attached to card
            XlDVUsuC — never Skope's. The published CMS page gets the same
            masthead at render time (`lib/finance/finance-apply-logo.ts`). */}
        <FinanceApplyLogo funder="silverchef" />
        <Link
          href="/silverchef"
          className="text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          &lsaquo; SilverChef Rent-Try-Buy
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-text-primary">
          Apply for equipment finance
        </h1>
        <p className="mt-2 text-text-secondary">
          Fill this in and our team will be in touch. Nothing is charged and you are not committed to
          anything by applying.
        </p>
      </header>

      <div className="mt-6">
        <FinanceApplicationForm
          fields={fields}
          intro={FINANCE_APPLICATION_INTRO}
          attachmentPrompts={[...FINANCE_ATTACHMENT_PROMPTS]}
          accountNumberTrigger={FUNDING_TYPE_HAS_SILVERCHEF_ACCOUNT}
          formKey={FINANCE_APPLICATION_FORM_KEY}
          funder="silverchef"
        />
      </div>
    </div>
  );
}
