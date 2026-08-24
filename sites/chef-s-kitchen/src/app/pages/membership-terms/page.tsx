import Link from "next/link";
import { getSubscriptionPlans } from "@/lib/store";

// ============================================================================
// Membership terms and conditions (card gk23c1VK, attachment 06/07 — marked
// "Deploy / Legal" in Tim's bundle and signed off 2026-08-24).
//
// THIS IS A CODE ROUTE, NOT A CMS PAGE, and deliberately so: these are the words
// the membership is held to, they are cited from /membership, and clause 12
// commits us to 30 days notice before two specific kinds of change. Keeping them
// in version control means every edit is dated, attributed and reviewable, which
// is what a substantiation challenge asks for.
//
// The consequence, recorded on the `sf-content-page` surface in the behaviour
// register: this slug is now owned by code. A CMS page authored at
// `/pages/membership-terms` would be SHADOWED by this route and never render, so
// a future move back to the CMS has to delete this file in the same change.
// ============================================================================

export const metadata = {
  title: "Membership terms and conditions",
  description:
    "The terms that apply to membership of the Chefs Depot buying group, alongside our general terms of sale.",
};

/** One numbered clause. Kept as data so the numbering cannot drift from the text. */
type Clause = { heading: string; body: Array<string | { strong: string; rest: string }> };

/**
 * THE TERMS DESCRIBE WHAT CAN ACTUALLY BE BOUGHT.
 *
 * Subscription billing is out of this card's scope, and only the monthly plan
 * exists in `subscription_plans` — so the yearly plan cannot be purchased and
 * the membership page's yearly toggle never renders. Terms that describe a
 * yearly option, a yearly renewal reminder and a yearly-versus-monthly switch
 * would be describing something a customer cannot buy, on the one page they are
 * held to. The yearly clauses therefore appear only when a yearly plan really is
 * on sale, and reappear by themselves the day one is created.
 */
function buildClauses(hasYearlyPlan: boolean): Clause[] {
  return [
  {
    heading: "Membership and eligibility",
    body: [
      "Membership of the Chefs Depot buying group is open to businesses buying for commercial use. One membership applies to one trading account. Chefs Depot may decline or end a membership where an account is not buying for commercial use, or where the account is used to obtain member pricing for resale outside the terms agreed with us.",
      "Member pricing is tied to your account. It applies when you are signed in, and to quotes issued to that account. Membership is not transferable between businesses.",
    ],
  },
  {
    heading: "Account users and access",
    body: [
      "Each membership has a primary contact who is responsible for the account. You may nominate additional users — a head chef, venue manager or bookkeeper, for example — and they buy at your account's level.",
      "The primary contact is responsible for everything done under the account, including orders placed and information accessed by nominated users, and for removing users who should no longer have access. All activity on the account, including orders placed by nominated users, is visible to the primary contact.",
      "A membership covers one trading account. Where you operate more than one venue under separate trading accounts, each account needs its own membership, and spend is counted separately for each.",
    ],
  },
  {
    heading: "Fees and billing",
    body: [
      hasYearlyPlan
        ? "Membership is charged monthly in advance, or yearly in advance. Current fees, and the saving on a yearly plan, are shown on the membership page and are inclusive of GST."
        : "Membership is charged monthly in advance. Current fees are shown on the membership page and are inclusive of GST.",
      "Fees are charged to the payment method held against your account on the same date each billing period. Where a payment fails, we may retry it, and member pricing may be suspended until the account is brought up to date.",
      "We may change the membership fee on 30 days written notice to the email address on your account. A change takes effect at your next renewal, and you may cancel before it applies.",
    ],
  },
  {
    heading: "Automatic renewal",
    body: [
      hasYearlyPlan
        ? "Membership renews automatically at the end of each period — each month on a monthly plan, each year on a yearly plan — using the payment method held against your account, at the fee current at that time."
        : "Membership renews automatically at the end of each month, using the payment method held against your account, at the fee current at that time.",
      hasYearlyPlan
        ? "On a yearly plan we will email a reminder to the address on your account at least 14 days before renewal. On a monthly plan, the recurring charge is your notice."
        : "The recurring monthly charge is your notice of renewal.",
      "To stop a renewal, cancel before the renewal date. Cancelling on or after the renewal date does not reverse that period's charge.",
      "You can turn off automatic renewal at any time from your account or by contacting us. If you do, membership ends at the close of the period already paid for.",
    ],
  },
  {
    heading: "Cancellation and refunds",
    body: [
      "You may cancel at any time, from your account or by contacting us. There is no contract term, exit fee or notice period.",
      "On cancellation, membership and member pricing continue to the end of the period already paid for, and no further payment is taken.",
      {
        strong: "Membership fees are non-refundable.",
        rest:
          " All membership transactions are final. No refund or pro-rata credit is given for any unused part of a billing period, whether you cancel, stop using the account, or your membership is ended under these terms.",
      },
      ...(hasYearlyPlan
        ? [
            "Switching between monthly and yearly takes effect at your next renewal. No credit is given for the remainder of the period already paid for.",
          ]
        : []),
      "Nothing in this clause limits your rights under the Australian Consumer Law, which apply to goods you buy from us regardless of your membership.",
    ],
  },
  {
    heading: "How member pricing is calculated",
    body: [
      "Member pricing is derived from our current trade price list at the moment it is displayed. Chefs Depot does not hold a separate price list. Where the trade price for an item changes, the member price for that item changes with it.",
      "Your level determines where between the entry and deepest member price your account sits for each item. The distance between those two prices is set per item and differs between products and brands. No fixed percentage discount applies, and none is represented.",
      "Prices displayed exclude GST unless stated. Freight, installation and third-party services are quoted separately.",
    ],
  },
  {
    heading: "Levels and spend",
    body: [
      "Your level is set by your spend on goods over the rolling twelve months ending at the date of calculation, excluding GST, freight, installation and third-party services. Clearance, end-of-line, supplier-funded and Partner Special purchases count toward your spend at the amount actually paid.",
      "Only spend made during periods for which membership fees have been paid counts toward your level.",
      "Levels are reviewed on the first of each month. Your level improves at the first review after your spend passes a threshold. Where spend falls below a threshold, your level is unchanged for ninety consecutive days, and any adjustment after that is by one level per review.",
      "The order being placed does not count toward the spend used to price it. Refunds and credits reduce spend for the period in which the original purchase falls.",
    ],
  },
  {
    heading: "Leaving and rejoining",
    body: [
      "When a membership ends, your level ends with it, and pricing on the account returns to our standard price.",
      "If you rejoin within 30 days, your previous level is restored and your spend history carries over.",
      "If you rejoin more than 30 days after a membership ends, you start again at the first level, and only spend from the new membership counts toward your level.",
    ],
  },
  {
    heading: "Offers, clearance and Partner Specials",
    body: [
      "Member pricing does not combine with other offers. Where a clearance, end-of-line, promotional or Partner Special price is lower than your member price, the lower price applies. You receive one or the other, never both.",
      "Partner Specials are limited by available stock and may be withdrawn or changed at any time. Where a Partner Special is supplied by a third party, that supplier's own terms apply to the goods, and we will identify the supplier at the point of offer.",
      "Indent and special-order lines, freight, installation and third-party services are quoted on their own terms and member pricing does not apply to them. This is identified on the relevant product page.",
    ],
  },
  {
    heading: "Quotes and price changes",
    body: [
      {
        strong: "Prices are subject to change without notice.",
        rest:
          " Our trade prices move when our suppliers move theirs, and member pricing is calculated from those prices at the moment it is displayed.",
      },
      "A quote is an estimate based on the prices current when it was issued. It is not a fixed-price offer. The prices on it may change before you accept it — because a supplier price has moved, or because your level has changed at a monthly review. We will tell you about any change before an order is accepted.",
      "Once we accept your order, the price for that order is fixed and does not change.",
    ],
  },
  {
    heading: "Pricing errors",
    body: [
      "Where a price is displayed in obvious error, we may correct it and decline or cancel an order placed at the incorrect price, and will contact you before doing so. Where payment has been taken, we will refund it in full. This does not affect an order we have already accepted and dispatched at a correct price.",
    ],
  },
  {
    heading: "Changes to these terms and the programme",
    body: [
      "Membership is subject to the rules of the buying group, including these terms, our privacy policy and our operating policies. We may amend those rules at any time, without notice, and the version published on this page applies from the time it is published.",
      "This includes the level structure, the spend thresholds, the number of levels, the benefits of membership, and the availability of Partner Specials. Any change to the level structure applies from the next monthly review.",
      "Two changes are always notified in advance: an increase in the membership fee, and a change that materially reduces the benefits of your membership. In both cases we give 30 days written notice to the email address on your account, and you may cancel before the change takes effect.",
      "We may end the buying group with notice, in which case membership fees paid for any period after it ends are refunded.",
    ],
  },
  {
    heading: "Your rights, privacy and governing law",
    body: [
      "Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. Nothing in these terms limits those rights, and membership neither adds to nor reduces them. Manufacturer warranties apply in the ordinary way.",
      "We handle personal and account information in line with our privacy policy, and we use your order history to calculate your level.",
      "These terms are governed by the laws of Victoria, Australia.",
    ],
  },
  ];
}

export default async function MembershipTermsPage() {
  // Read the plans that really exist rather than describing the ones the bundle
  // proposed: see buildClauses.
  const plans = (await getSubscriptionPlans().catch(() => [])) as Array<{
    billing_interval?: string;
  }>;
  const clauses = buildClauses(plans.some((p) => p.billing_interval === "year"));
  return (
    <div className="container-page section-padding">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow mb-3">The fine print</p>
        <h1 className="section-title">Membership terms and conditions</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          These apply to membership of the Chefs Depot buying group, and sit alongside our general
          terms of sale.
        </p>

        <ol className="mt-10 space-y-10">
          {clauses.map((clause, i) => (
            <li key={clause.heading}>
              <h2 className="heading-serif text-xl text-text-primary">
                {i + 1}. {clause.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {clause.body.map((para, j) =>
                  typeof para === "string" ? (
                    <p key={j} className="text-sm leading-relaxed text-text-body">
                      {para}
                    </p>
                  ) : (
                    <p key={j} className="text-sm leading-relaxed text-text-body">
                      <strong className="font-semibold text-text-primary">{para.strong}</strong>
                      {para.rest}
                    </p>
                  )
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-sm text-text-secondary">
          <Link href="/membership" className="underline hover:text-text-primary">
            Back to membership
          </Link>
        </p>
      </div>
    </div>
  );
}
