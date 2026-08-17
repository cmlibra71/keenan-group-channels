import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCmsPage, getSiteConfig } from "@/lib/store";

// ============================================================================
// The SilverChef information page (card 6f47rFeT).
//
// ONE SILVERCHEF PAGE PER STOREFRONT, and the CMS one wins.
//
// Steve's card asks for a SilverChef page to be ADDED to the site. Industry
// Kitchens already has one: a published, staff-editable CMS page at
// `/pages/silverchef` (channel 1, cms_pages id 51, live since 2026-08-04), and
// the two Zoey redirects for the old addresses point at it. Chefs Depot has
// none — that is the real gap this route fills.
//
// So this route RESOLVES rather than competes. When the channel has a published
// `silverchef` CMS page it redirects there, which keeps the register's rule that
// content lives at `/pages/<slug>` and the two must not drift (content.md,
// `cms-pages-admin`, cards PukVI53u + EVvRDnZt) — one page, staff-editable,
// no second copy with different copy on the same site. When it has none, this
// coded page serves, so the finance panel on every product page always has a
// destination and Chefs Depot gets its SilverChef page today. The moment staff
// author one on CD, it takes over here with no deploy.
//
// The APPLICATION FORM is not on this page: it lives at `/silverchef/apply`, a
// coded route on both sites, because `/pages/silverchef` is a CMS document and
// a CMS document cannot carry the form. That is also what the product panel's
// "Apply for Finance" links to, so the button opens the form on both
// storefronts whichever page is serving here.
// ============================================================================

export const metadata: Metadata = {
  title: "SilverChef Rent-Try-Buy equipment finance",
  description:
    "Finance your commercial kitchen equipment with SilverChef Rent-Try-Buy. Low weekly rental payments, upgrade or buy at any time, and apply online in minutes.",
};

export default async function SilverChefPage() {
  // The channel's own published page wins. `getCmsPage` returns a row only when
  // the page is BOTH published and visible, which is exactly the test for "a
  // customer can already read a SilverChef page on this site".
  const cms = await getCmsPage("silverchef").catch(() => null);
  if (cms) redirect("/pages/silverchef");

  const config = await getSiteConfig().catch(() => null);
  const storeName = config?.site?.siteName || config?.channel?.name || "our store";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-text-primary">
            SilverChef Rent-Try-Buy equipment finance
          </h1>
          <p className="mt-2 text-text-secondary">
            Fit out your kitchen with low weekly rental payments instead of a large upfront spend.
          </p>
        </div>
        <img
          src="/silverchef-logo.png"
          alt="SilverChef"
          width={220}
          height={117}
          className="h-14 w-auto self-start"
        />
      </header>

      <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card title="Choose your equipment">
          Pick the equipment you need at {storeName} and rent it on a SilverChef Rent-Try-Buy
          agreement — the weekly figure is shown on every product page.
        </Card>
        <Card title="Approvals are quick">
          Applications take a few minutes and approvals are fast. A refundable security bond applies,
          and approval is subject to SilverChef&apos;s own checks.
        </Card>
        <Card title="Upgrade or buy at any time">
          Outgrown a machine? Upgrade and pay the difference in your weekly payments. Buy it outright
          whenever you like and receive a 75% rebate on the rental payments you have already made.
        </Card>
      </section>

      <section className="mt-10 space-y-4 text-text-body">
        <h2 className="text-2xl font-semibold text-text-primary">How Rent-Try-Buy works</h2>
        <p>
          Rent-Try-Buy is a 12-month rental agreement that lets you try the equipment before you
          commit to buying it. Payments are weekly, which keeps your working capital where it is
          useful — in stock, staff and marketing rather than in depreciating assets.
        </p>
        <p>At the end of the 12 months you choose what happens next:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Buy it.</strong> Purchase the equipment outright and receive a 75% rebate on the
            rental payments you have made.
          </li>
          <li>
            <strong>Own it over time.</strong> Move to SilverChef&apos;s Easy Own plan and own the
            equipment at the end of the term.
          </li>
          <li>
            <strong>Give it back.</strong> Return the equipment with no further obligation.
          </li>
        </ul>
        <p className="text-sm text-text-muted">
          Weekly figures shown on our product pages are indicative, GST inclusive, and subject to
          SilverChef approval. Skope-branded equipment is funded by Skope Funding at its own rate and
          is shown as &ldquo;Own Me $X a week&rdquo;. Talk to us about the finance terms that suit
          your business.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-text-primary">Apply for finance</h2>
        <p className="mt-2 text-text-secondary">
          Fill in the application and our team will be in touch. Nothing is charged and you are not
          committed to anything by applying.
        </p>
        <Link
          href="/silverchef/apply"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-text-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          Apply for Finance <span aria-hidden="true">&rsaquo;</span>
        </Link>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-primary p-5">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 text-sm text-text-secondary">{children}</p>
    </div>
  );
}
