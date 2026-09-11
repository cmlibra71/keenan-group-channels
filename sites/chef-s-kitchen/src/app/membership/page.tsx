import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import {
  getSubscriptionPlans,
  getFeatureFlag,
  getActiveSubscriptionForContact,
  getPartnerOffers,
  getLadderConfig,
} from "@/lib/store";
import { getSession } from "@/lib/auth";
import { ScaleExplorer } from "@/components/membership/ScaleExplorer";
import { PlanChoice, type MembershipPlanOption } from "@/components/membership/PlanChoice";
import { PartnerLogos } from "@/components/membership/PartnerLogos";

// ============================================================================
// The Chefs Depot buying group (card gk23c1VK — Tim Keenan's membership bundle,
// signed off 2026-08-24; its pricing model LOCKED 11 Sep 2026: a member's price
// moves continuously from the advertised Mates Rate at $0 of rolling twelve-month
// spend down to Wholesale + 1% at $50,000 — no levels, no thresholds).
//
// This page replaces one that claimed "members-only pricing (10–25% off retail)"
// in four places and ran a savings calculator producing a dollar figure from an
// assumed 15% average discount. Neither had a measured basis, and "off retail"
// misdescribed the reference price, which is our standard trade price.
//
// SO: THERE IS NO PRODUCT-SAVING PERCENTAGE ON THIS PAGE, AND NONE MAY BE ADDED
// until the real spread between the advertised price and the floor has been
// measured across the catalogue (`CD_PRICING.spread` stays null). The distance differs per item — it is set by
// how hard the group buys that item — so the data cannot produce a single
// site-wide figure, and any published claim has to survive an Australian
// Consumer Law challenge on substantiation. The one percentage here is the
// yearly fee against twelve monthly fees, which is arithmetic on our own prices.
// (Blueprint §10 and §13.)
//
// AND: EVERY CLAIM ABOUT HOW THE PRICE IS BUILT IS GATED ON `ladderOn` — the
// member price scale's switch (`channel_settings.cd_member_ladder`), which ships
// OFF and is unwritten on both live channels. With it off a Chefs Depot member
// is priced by a markup on our own buying cost from their first order, and no
// monthly review runs. With it ON a new member pays the ADVERTISED price at $0
// of spend — "there is no price step on joining" — so the off-state promise that
// "every line reprices" the day you join is FALSE there, and so is anything
// implying a day-one saving (Tim's may-not-say list). Copy and engine turn on
// together, in one setting. Anything true either way is written once, ungated.
//
// Tim's 11 Sep `03-membership.html` still carries three sentences from the
// retired model ("the step change on day one", "cross a threshold", "one step
// at a time"). They contradict his own locked rules, so the ON copy below takes
// his locked wording from the same page ("no tiers to cross and no thresholds to
// just miss", "every dollar moves you a little further down") instead.
// ============================================================================

export async function generateMetadata() {
  // The description makes a claim about HOW the price is built, so it obeys the
  // same switch as the words on the page. A static export could not read it.
  const ladder = await getLadderConfig().catch(() => null);
  const ladderOn = Boolean(ladder?.enabled);
  return {
    title: "Chefs Depot Buying Group",
    description: ladderOn
      ? "Members Spend More, Save More — member pricing moves with your rolling twelve-month spend, calculated from the trade price list our own team quotes from."
      : "Members don't get a discount. They get a different price tier — applied to your account automatically, from your first order.",
  };
}

export default async function MembershipLandingPage() {
  const enabled = await getFeatureFlag("subscriptions_enabled");
  if (!enabled) redirect("/");

  const [plans, partnerOffers, ladder] = await Promise.all([
    getSubscriptionPlans(),
    getPartnerOffers(),
    getLadderConfig(),
  ]);

  const primary = plans[0] as
    | { slug: string; name: string; price: string; billing_interval: string }
    | undefined;
  if (!primary) redirect("/");

  // Route the join CTA on session + subscription state. Without this a signed-in
  // visitor lands in a /account/register → /account redirect loop, because the
  // register page bounces anyone who already has a session.
  //
  // This also answers the bundle's open item 5 — its CTAs all pointed at
  // /account/register, which it flagged as a guess. They point where the flow
  // actually goes.
  const session = await getSession();
  const activeSub = session ? await getActiveSubscriptionForContact(session.contactId) : null;
  const hrefFor = (slug: string) =>
    !session ? "/account/register" : activeSub ? "/account/membership" : `/account/membership/subscribe/${slug}`;
  const ctaLabel = activeSub ? "Manage membership" : "Start your membership";

  const planOptions: MembershipPlanOption[] = (plans as Array<{
    slug: string;
    name: string;
    price: string;
    billing_interval: string;
  }>)
    .map((p) => ({
      slug: p.slug,
      interval: p.billing_interval,
      price: parseFloat(p.price),
      href: hrefFor(p.slug),
      label: p.name,
    }))
    .filter((p) => Number.isFinite(p.price));

  // See the header note: every claim about how the price is built is gated on
  // the channel's member price scale actually being switched on.
  const ladderOn = ladder.enabled;
  const topSpend = ladder.fullShareSpend;
  const topLabel = `$${Math.round(topSpend).toLocaleString("en-AU")}`;

  const feeCard = <PlanChoice plans={planOptions} ctaLabel={ctaLabel} ladderOn={ladderOn} />;

  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="section-bordered">
        <div className="container-page section-padding">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-start">
            <div>
              <p className="eyebrow mb-3">Chefs Depot Buying Group</p>
              <h1 className="hero-title text-text-primary">
                Members don&rsquo;t get a discount. They get a different price tier.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-secondary">
                {ladderOn
                  ? `The price on screen is our standard trade price — the one anyone can pay. Members Spend More, Save More: from your first order, every dollar you spend moves your price a little further down on almost 40,000 items, reviewed on the first of each month, until you reach our deepest member price at ${topLabel}.`
                  : "Members buy as a group and see a different number on every line. Your member price applies from your first order, automatically, with no code to remember."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={hrefFor(primary.slug)} className="btn-primary inline-flex items-center justify-center gap-2">
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {ladderOn && (
                  <a
                    href="#how-it-moves"
                    className="inline-flex items-center justify-center rounded-btn border border-border-strong px-6 py-3 text-sm font-semibold text-text-primary hover:bg-surface-secondary"
                  >
                    See how the price moves
                  </a>
                )}
              </div>
            </div>
            <div>{feeCard}</div>
          </div>
        </div>
      </section>

      {/* ── The ladder ─────────────────────────────────────────────────── */}
      {ladderOn && (
      <section id="how-it-moves" className="container-page section-padding">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="eyebrow mb-3">Members Spend More, Save More</p>
            <h2 className="section-title">See how the price moves</h2>
          </div>
          <ScaleExplorer topSpend={topSpend} maxSpend={Math.round(topSpend * 1.2)} />
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">On joining</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Your account starts building toward better pricing from your first order.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">As you spend</h3>
              <p className="mt-1 text-sm text-text-secondary">
                Spend More, Save More — measured on a rolling twelve months, not a calendar year, and
                reviewed on the first of each month.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">How far it goes</h3>
              <p className="mt-1 text-sm text-text-secondary">
                The more the group buys of a brand, the harder we buy it — and the better the member
                price on it.
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="section-bordered">
        <div className="container-page section-padding">
          <div className="mb-12 text-center">
            <p className="eyebrow mb-3">How it works</p>
            <h2 className="section-title">
              {ladderOn
                ? "Your price moves with your spend — every dollar counts."
                : "The price moves the day you join."}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-text-secondary">
              {ladderOn
                ? "No tiers to cross and no thresholds to just miss. The more you buy over twelve months, the further down your price goes — for as long as you keep buying. Partner Specials sit alongside."
                : "Most schemes make you earn your way to anything worthwhile. This one gives you the step change on day one. Partner Specials sit alongside it."}
            </p>
          </div>

          <div className={ladderOn ? "grid gap-6 lg:grid-cols-3" : "grid gap-6 lg:grid-cols-2"}>
            <article className="rounded-2xl border border-border-strong bg-white p-6">
              <p className="eyebrow mb-2">{ladderOn ? "Joining" : "On joining"}</p>
              <h3 className="heading-serif text-xl text-text-primary">
                {ladderOn ? "Your pricing starts moving" : "Straight to member pricing"}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {ladderOn
                  ? "The moment your membership is active, your account starts building toward better pricing on every line. No points, no qualifying period, no code to remember at four in the afternoon with a delivery to book. The price on the product page is your price."
                  : "The moment your membership is active, every line on the site reprices. No points, no qualifying period, no code to remember at four in the afternoon with a delivery to book. The price on the product page is your price."}
              </p>
              <p className="mt-3 text-xs text-text-muted">
                Member pricing is the default across {ladderOn ? "almost 40,000 items" : "the range"}, not a
                promotion on selected lines.
              </p>
            </article>

            {ladderOn && (
            <article className="rounded-2xl border border-border-strong bg-white p-6">
              <p className="eyebrow mb-2">Spending</p>
              <h3 className="heading-serif text-xl text-text-primary">Spend More, Save More</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Your rolling twelve-month spend sets your price directly, reviewed on the first of each
                month. Nobody buys evenly across a year, so a quiet quarter costs you nothing for ninety
                days — and even then your price only ever moves back gradually, a little at a time.
              </p>
              <p className="mt-3 text-xs text-text-muted">
                Every member starts at the advertised price and reaches our deepest member price at{" "}
                {topLabel}.
              </p>
            </article>
            )}

            <article className="rounded-2xl border border-border-strong bg-white p-6">
              <p className="eyebrow mb-2">{ladderOn ? "Alongside both moves" : "Alongside member pricing"}</p>
              <h3 className="heading-serif text-xl text-text-primary">Partner Specials</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Suppliers bring us bulk buys, clearance and end-of-line stock, and it reaches the
                group before it goes anywhere else. A special is priced by what we managed to secure,
                {" independent of your member pricing."}
              </p>
              <p className="mt-3 text-xs text-text-muted">
                You always land on the lower of the two.
                {ladderOn
                  ? " Whatever you spend on a Partner Special still counts toward your rolling twelve months."
                  : ""}
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── What's included ────────────────────────────────────────────── */}
      <section className="container-page section-padding">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-3">What&rsquo;s included</p>
          <h2 className="section-title">Built for the people doing the ordering.</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ...(ladderOn
              ? [
                  {
                    title: "Spend More, Save More",
                    body: `Your rolling twelve-month spend sets your price directly — no tiers to cross and no thresholds to just miss. Every dollar moves you a little further down, reviewed monthly, until you reach our deepest member price at ${topLabel}.`,
                  },
                ]
              : []),
            {
              title: "Partner Specials",
              body: ladderOn
                ? "Supplier bulk buys, clearance and end-of-line stock, offered to the group before it goes anywhere else. Some are already as sharp as they go — and every dollar still counts toward your spend."
                : "Supplier bulk buys, clearance and end-of-line stock, offered to the group before it goes anywhere else. Some are already as sharp as they go.",
            },
            {
              title: "Member pricing on every line",
              body: ladderOn
                ? "Applied automatically across almost 40,000 items, with no codes and no minimum order. Clearance, Partner Specials and special-order lines are priced separately — you always get the better of the two."
                : "Applied automatically across the range, with no codes and no minimum order. Clearance, Partner Specials and special-order lines are priced separately — you always get the better of the two.",
            },
            {
              title: "Account management",
              body: "A named contact who knows your kitchen, your equipment and your order history. No re-explaining the site every time you call, and no starting again with whoever picks up.",
            },
            {
              title: "Customer portal",
              body: "Your orders, quotes, invoices, delivery status and current Partner Specials in one place. Pull a copy when your bookkeeper asks, and see where your spend sits without ringing anyone.",
            },
            {
              title: "Australia-wide delivery",
              body: "Commercial kitchen equipment delivered nationally, with freight quoted openly on every order so you can see exactly what it costs.",
            },
          ].map((item) => (
            <article key={item.title} className="rounded-2xl border border-border-strong bg-white p-6">
              <h3 className="heading-serif text-lg text-text-primary">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── The buying group ───────────────────────────────────────────── */}
      <section className="section-bordered">
        <div className="container-page section-padding">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="eyebrow mb-3">The buying group</p>
              <h2 className="section-title">
                One venue orders like one venue. A few thousand order like a distributor.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Chefs Depot members buy as a single block. Every order adds to the volume we put
                through a brand, and volume is what moves a supplier — so the harder the group buys
                something, the better the price sitting behind it for every member.
                {ladderOn
                  ? " This is why the movement differs by product: it follows what the group actually buys."
                  : " This is why the gap between our standard price and the member price differs by product: it follows what the group actually buys."}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                A single cafe ordering one under-counter fridge has no leverage with the brand behind
                it. Several hundred venues ordering that same fridge across a year is a different
                conversation entirely — and it is one we have on your behalf rather than yours.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Who&rsquo;s in the group</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Built for hospitality operators buying for a working kitchen — whether that&rsquo;s
                one espresso machine this month or a full fit-out next quarter.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {[
                  "Cafes & coffee shops",
                  "Restaurants",
                  "Pubs & bars",
                  "Hotels",
                  "Bakeries & patisseries",
                  "Clubs & function venues",
                  "Caterers",
                  "Food trucks",
                  "Aged care & healthcare",
                  "Schools & childcare",
                ].map((who) => (
                  <li
                    key={who}
                    className="rounded-full border border-border-strong px-3 py-1 text-xs text-text-secondary"
                  >
                    {who}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <PartnerLogos offers={partnerOffers} />

      {/* ── How we keep it straight ────────────────────────────────────── */}
      <section className="container-page section-padding">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-3">How we keep it straight</p>
          <h2 className="section-title">Every price we show you, we can show our working on.</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            {
              title: "Prices you can trace",
              body: ladderOn
                ? "Our trade prices move when our suppliers move theirs, and member pricing follows the same day — up or down. There is no separate list and no lag working against you."
                : "Our prices move when our suppliers move theirs, and member pricing follows the same day — up or down. There is no lag working against you.",
            },
            // "Every price is on the record" is the ladder's own audit trail
            // (`cd_price_audit`, written only by the ladder resolver). With the
            // ladder off nothing is recorded against a line, so the claim is not
            // rephrased for the off state — it is not made at all.
            ...(ladderOn
              ? [
                  {
                    title: "Every price is on the record",
                    body: "Where your pricing sat and the trade prices behind it are recorded against every quote and every order line. Ask us about a price from six months ago and we can show you exactly how it was built.",
                  },
                ]
              : []),
            {
              title: ladderOn ? "One list, openly applied" : "One price, openly applied",
              body: ladderOn
                ? "Member pricing comes off the same trade list our own team quotes from. There is one source of truth, and your account reads from it directly."
                : "Member pricing is applied by your account, not by a code you have to remember. The price on the product page is the price at checkout, on every line.",
            },
            {
              title: "Your rights stand either way",
              body: "Everything you buy carries your full rights under the Australian Consumer Law, and manufacturer warranties apply in the ordinary way — membership sits on top of all of it.",
            },
          ].map((item) => (
            <article key={item.title} className="flex gap-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── The detail ─────────────────────────────────────────────────── */}
      <section className="section-bordered">
        <div className="container-page section-padding">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <p className="eyebrow mb-3">Good to know</p>
              <h2 className="section-title">The detail</h2>
              <p className="mt-3 text-text-secondary">
                The questions members ask most, answered plainly. The full terms are linked below.
              </p>
            </div>
            <div className="divide-y divide-border">
              {[
                {
                  q: "How the buying group sets the price",
                  a: ladderOn
                    ? "Every price is calculated from our current trade price list at the moment you see it — the same list our own team quotes from. That list reflects what the group buys, so as combined volume on a brand or an item grows, the price behind it improves for every member. When the trade price improves, yours improves with it, the same day."
                    : "Member pricing is applied to your account automatically — every line reprices the moment your membership is active, with no code and no minimum order. What the group buys is what moves a supplier, so as combined volume on a brand or an item grows, the price behind it improves for every member. When our buying price improves, yours improves with it, the same day.",
                },
                ...(ladderOn
                  ? [
                      {
                        q: "How your pricing is calculated",
                        a: "Your rolling twelve-month spend as a member, excluding GST, freight, installation and third-party service. Clearance, end-of-line and Partner Specials all count toward it, at whatever you actually paid. Reviewed on the first of each month.",
                      },
                      {
                        q: "How your pricing moves",
                        a: "Your price moves down at the first monthly review after your spend grows — every dollar counts, with no thresholds to cross. A quiet spell is forgiven for ninety days, and any move back after that is gradual, never more than a sixth of the way at a time.",
                      },
                      {
                        q: "Your first big order",
                        a: "The order you place today counts toward the price you buy at next, not toward its own. If your first order is a large one, talk to us first and we'll look after it on the day.",
                      },
                    ]
                  : []),
                {
                  q: "You always get the better price",
                  a: ladderOn
                    ? "Where a clearance, end-of-line or Partner Special is sharper than your member price, you get the sharper one. Either way the full amount counts toward your spend and moves your pricing further down."
                    : "Where a clearance, end-of-line or Partner Special is sharper than your member price, you get the sharper one — never both.",
                },
                {
                  q: "Where member pricing applies",
                  a: ladderOn
                    ? "Member pricing runs across our range of almost 40,000 items. A small number of brands and products sit outside it, and those are flagged on the product page — what you spend on them still counts toward your pricing everywhere else. Clearance, end-of-line, Partner Specials, indent and special-order lines, freight, installation and third-party service are priced on their own terms. Where one of those is sharper than your member price, you pay the sharper one — and everything you spend on goods still counts toward your pricing."
                    : "Member pricing runs across our range. Clearance, end-of-line, Partner Specials, indent and special-order lines, freight, installation and third-party service are priced on their own terms. Where one of those is sharper than your member price, you pay the sharper one.",
                },
              ].map((item, i) => (
                <details key={item.q} className="group py-4" open={i === 0}>
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text-primary marker:hidden">
                    {String(i + 1).padStart(2, "0")} &nbsp;{item.q}
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Join / terms ───────────────────────────────────────────────── */}
      <section className="container-page section-padding">
        <div className="mx-auto max-w-md text-center">
          {feeCard}
          <p className="mt-6 text-xs text-text-secondary">
            Membership is subject to the{" "}
            <Link href="/membership/terms" className="underline hover:text-text-primary">
              membership terms and conditions
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
