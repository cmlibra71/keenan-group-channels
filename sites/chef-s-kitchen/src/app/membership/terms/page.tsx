import Link from "next/link";
import { redirect } from "next/navigation";
import { getSubscriptionPlans, getLadderConfig, getCmsPage } from "@/lib/store";

// ============================================================================
// Membership terms and conditions (card gk23c1VK, attachment 06/07 — marked
// "Deploy / Legal" in Tim's bundle and signed off 2026-08-24).
//
// WHY THIS LIVES AT `/membership/terms` AND NOT AT `/pages/membership-terms`.
// A static route at `/pages/<slug>` permanently SHADOWS the CMS renderer for
// that slug — the CMS page would never render, and nobody would be told why.
// That is the drift the `sf-content-page` rule exists to prevent ("exactly ONE
// customer-facing page per storefront, and the CMS one wins" — card 6f47rFeT),
// and `/silverchef` is that card's own precedent: a coded route that steps
// aside the moment a published CMS page exists at the slug. So these terms sit
// at a coded address of their own, leaving `/pages/membership-terms` free for
// the CMS, and they ALSO defer the way `/silverchef` does: publish a visible
// `membership-terms` page in the CMS and this route redirects to it, with no
// deploy.
//
// They are code today because they are the words the membership is held to,
// they are cited from `/membership`, and clause 12 commits us to 30 days notice
// before two specific kinds of change. Version control dates and attributes
// every edit, which is what a substantiation challenge asks for.
// ============================================================================

export const metadata = {
  title: "Membership terms and conditions",
  description:
    "The terms that apply to membership of the Chefs Depot buying group, alongside our general terms of sale.",
};

/** One numbered clause. Kept as data so the numbering cannot drift from the text. */
type Clause = { heading: string; body: Array<string | { strong: string; rest: string }> };

/**
 * THE TERMS DESCRIBE WHAT A MEMBERSHIP ACTUALLY IS, TODAY, ON THIS CHANNEL.
 *
 * Two switches, and both work the same way, for the same reason: terms are the
 * words a paid membership is held to, so they may not describe an option nobody
 * can buy or an engine that is not running.
 *
 * `hasYearlyPlan` — subscription billing is out of this card's scope and only
 * the monthly plan exists in `subscription_plans`, so the yearly toggle never
 * renders. The yearly clauses appear only when a yearly plan really is on sale,
 * and reappear by themselves the day one is created.
 *
 * `ladderOn` — the member price scale ships OFF (`channel_settings.cd_member_ladder`
 * is unwritten on both live channels). With it off, member pricing is a markup
 * applied to our own buying cost and no monthly review runs. Every clause about
 * the scale — the formula's ends, the $50,000 top, spend during paid membership,
 * the monthly review, the ninety-day hold and one-sixth step, rejoining within
 * 30 days, exclusions declared on the product page — is gated on the scale
 * actually being switched on, and the off state carries the clause that is true
 * instead. Copy and engine turn on together, in one setting.
 *
 * The ON clauses are Tim's 11 Sep 2026 terms (`06-membership-terms.html`, the
 * locked model) with one kind of edit: his text still says "your level" in four
 * places, a word from the retired seven-level model that describes nothing in
 * the locked one ("no levels"). Those read "your pricing" here. His numbers,
 * rules and legal wording are otherwise verbatim — and the terms are still
 * awaiting the legal review his pack lists as open item 8.
 */
function buildClauses(hasYearlyPlan: boolean, ladderOn: boolean, topSpend = 50_000): Clause[] {
  const top = `$${Math.round(topSpend).toLocaleString("en-AU")}`;
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
      ladderOn
        ? "Each membership has a primary contact who is responsible for the account. You may nominate additional users — a head chef, venue manager or bookkeeper, for example — and they buy at your account's pricing."
        : "Each membership has a primary contact who is responsible for the account. You may nominate additional users — a head chef, venue manager or bookkeeper, for example — and they buy at your account's member pricing.",
      "The primary contact is responsible for everything done under the account, including orders placed and information accessed by nominated users, and for removing users who should no longer have access. All activity on the account, including orders placed by nominated users, is visible to the primary contact.",
      ladderOn
        ? "A membership covers one trading account. Where you operate more than one venue under separate trading accounts, each account needs its own membership, and spend is counted separately for each."
        : "A membership covers one trading account. Where you operate more than one venue under separate trading accounts, each account needs its own membership.",
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
    body: ladderOn
      ? [
          "Member pricing is derived from our current trade price list at the moment it is displayed. Chefs Depot does not hold a separate price list. Where the trade price for an item changes, the member price for that item changes with it.",
          `Your trailing spend determines where between the advertised price and the deepest member price your account sits for each item, as a continuous proportion rather than in steps. The deepest member price on any item is set 1% above the Industry Kitchens Wholesale price for that item, and nothing is ever sold below it. You reach it at ${top} of rolling twelve-month spend. The distance between those two prices is set per item and differs between products and brands. No fixed percentage discount applies, and none is represented.`,
          "Prices displayed exclude GST unless stated. Freight, installation and third-party services are quoted separately.",
        ]
      : [
          "Member pricing is applied to your account automatically. It applies to every line while you are signed in, and to quotes issued to that account. There is no code to enter and no minimum order.",
          "Member prices are calculated from what an item costs us at the moment the price is displayed. Where that cost changes, the member price for that item changes with it, up or down.",
          "The difference between our standard price and the member price is set per item and differs between products and brands. No fixed percentage discount applies, and none is represented.",
          "Prices displayed exclude GST unless stated. Freight, installation and third-party services are quoted separately.",
        ],
  },
  ...(ladderOn
    ? [
        {
          heading: "Spend and your pricing",
          body: [
            "Your price is set by your spend on goods over the rolling twelve months ending at the date of calculation, excluding GST, freight, installation and third-party services. Clearance, end-of-line, supplier-funded and Partner Special purchases count toward your spend at the amount actually paid.",
            "Only spend made during periods for which membership fees have been paid counts toward your pricing.",
            "Pricing is reviewed on the first of each month and moves with your trailing spend. Where spend falls, your pricing is unchanged for ninety consecutive days, and any adjustment after that is limited to one sixth of the full range per review.",
            "The order being placed does not count toward the spend used to price it. Refunds and credits reduce spend for the period in which the original purchase falls.",
          ],
        } satisfies Clause,
      ]
    : []),
  {
    heading: "Leaving and rejoining",
    body: ladderOn
      ? [
          "When a membership ends, member pricing ends with it, and the account returns to our standard price.",
          "If you rejoin within 30 days, your previous pricing is restored and your spend history carries over.",
          "If you rejoin more than 30 days after a membership ends, your spend starts again from zero, and only spend from the new membership counts toward your pricing.",
        ]
      : [
          "When a membership ends, member pricing ends with it, and pricing on the account returns to our standard price.",
          "If you rejoin, member pricing applies again from the day the new membership starts.",
        ],
  },
  {
    heading: "Offers, clearance and Partner Specials",
    body: [
      "Member pricing does not combine with other offers. Where a clearance, end-of-line, promotional or Partner Special price is lower than your member price, the lower price applies. You receive one or the other, never both.",
      "Partner Specials are limited by available stock and may be withdrawn or changed at any time. Where a Partner Special is supplied by a third party, that supplier's own terms apply to the goods, and we will identify the supplier at the point of offer.",
      ladderOn
        ? "Indent and special-order lines, freight, installation and third-party services are quoted on their own terms and member pricing does not apply to them. Some brands and products are also excluded from member pricing under our agreements with their suppliers, and we may add or remove a brand from that list as those agreements change. All exclusions are identified on the relevant product page, and what you spend on them still counts toward your pricing on everything else."
        : "Indent and special-order lines, freight, installation and third-party services are quoted on their own terms and member pricing does not apply to them. This is identified on the relevant product page.",
    ],
  },
  {
    heading: "Quotes and price changes",
    body: [
      {
        strong: "Prices are subject to change without notice.",
        rest: ladderOn
          ? " Our trade prices move when our suppliers move theirs, and member pricing is calculated from those prices at the moment it is displayed."
          : " Our prices move when our suppliers move theirs, and member pricing is calculated at the moment it is displayed.",
      },
      ladderOn
        ? "A quote is an estimate based on the prices current when it was issued. It is not a fixed-price offer. The prices on it may change before you accept it — because a supplier price has moved, or because your pricing has changed at a monthly review. We will tell you about any change before an order is accepted."
        : "A quote is an estimate based on the prices current when it was issued. It is not a fixed-price offer. The prices on it may change before you accept it, because a supplier price has moved. We will tell you about any change before an order is accepted.",
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
      ladderOn
        ? "This includes the pricing scale, the spend at which the deepest price is reached, the benefits of membership, and the availability of Partner Specials. Any change to the pricing scale applies from the next monthly review."
        : "This includes how member pricing is calculated, the benefits of membership, and the availability of Partner Specials.",
      "Two changes are always notified in advance: an increase in the membership fee, and a change that materially reduces the benefits of your membership. In both cases we give 30 days written notice to the email address on your account, and you may cancel before the change takes effect.",
      "We may end the buying group with notice, in which case membership fees paid for any period after it ends are refunded.",
    ],
  },
  {
    heading: "Your rights, privacy and governing law",
    body: [
      "Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. Nothing in these terms limits those rights, and membership neither adds to nor reduces them. Manufacturer warranties apply in the ordinary way.",
      ladderOn
        ? "We handle personal and account information in line with our privacy policy, and we use your order history to calculate your pricing."
        : "We handle personal and account information in line with our privacy policy.",
      "These terms are governed by the laws of Victoria, Australia.",
    ],
  },
  ];
}

export default async function MembershipTermsPage() {
  // The channel's own published page wins, exactly as `/silverchef` does — see
  // the header note. `getCmsPage` returns a row only when the page is BOTH
  // published and visible, which is the test for "a customer can already read
  // these terms on this site".
  const cms = await getCmsPage("membership-terms").catch(() => null);
  if (cms) redirect("/pages/membership-terms");

  // Read what really exists rather than describing what the bundle proposed:
  // the plans that are actually on sale, and whether the ladder is actually
  // running. See buildClauses.
  const [plans, ladder] = await Promise.all([
    getSubscriptionPlans().catch(() => [] as Array<{ billing_interval?: string }>),
    getLadderConfig().catch(() => ({ enabled: false, fullShareSpend: 50_000 })),
  ]);
  const clauses = buildClauses(
    (plans as Array<{ billing_interval?: string }>).some((p) => p.billing_interval === "year"),
    Boolean(ladder.enabled),
    ladder.fullShareSpend
  );
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
