"use client";

// ============================================================================
// Chefs Depot's prices and the spend-more-save-more ladder, on the product page
// (card Nyp8bkPm; Tim's model, approved on the board 2026-08-24).
//
// SEALED NATIVE, not an authored subtree, for the same reason the SilverChef
// panel is one: the figures follow the LIVE purchase state (which variant is
// selected, whether this product's price is hidden) and an authored tree cannot
// call a pricing engine. Keyed `cd-member-pricing` and placed at render time by
// `builder/cd-member-pricing-node.ts`, so it lands on the stored tree without
// anybody re-authoring a template.
//
// THE PAYMENT CLAIM IS MADE BY COMPARISON, NEVER BY ASSUMPTION. "What you pay
// today" is attached to whichever row equals the price the buy box is actually
// charging, and to none of them if none match. That is the guard: an earlier
// cut of this panel told every Chefs Depot visitor they paid the Mates Rates
// figure while the headline and the cart charged ~22% more, because the channel
// suppresses the shared sale price and a guest pays RRP. A label that is derived
// from the page's own number cannot drift from it.
//
// THE TOP-TIER PRICE AND THE RANGE ARE PUBLISHED AS FIGURES. The card asks for
// the "GMC / top-tier discount price" and for a widget naming the min and max
// available on spend. Both ends of the ladder are PRICES at a configured rung —
// read from the same engine at the first and last levels — so they are named in
// dollars, for the SKU on screen, without deriving a percentage.
//
// THIS PANEL CARRIES THE ONLY JOIN CTA ON A CHEFS DEPOT PRODUCT PAGE, and that
// is not a style choice. `components/ui/PriceBlock.tsx` does NOT draw the gold
// box on this site: channel 2's stored `price-panel` Site Builder component does
// (nodes `join-strip-x18` and `member-teaser-x25`), and the only one a guest
// ever sees is the teaser, conditioned on `purchase.showMemberTeaser` =
// `memberSavingsPct > 0`. Retiring the percentage takes that box off the screen
// — verified by rendering the real channel-2 page — so without a button here a
// Chefs Depot product page would carry no membership call to action at all.
// Checked against the database: `2/price-panel` is the ONLY stored component in
// either channel that uses the teaser or a price native, so there is no tree on
// which this button and PriceBlock's can both appear.
//
// The words are Tim's own "Product page price note" (gk23c1VK,
// `05-widget-kit.html`), which is what that box should have been saying anyway.
//
// NO PERCENTAGE. Not per product, not site-wide. The M-to-R spread differs SKU
// by SKU, so there is no single discount percentage in this system and one
// cannot be derived; Tim's pack forbids publishing any figure until the spread
// distribution has been measured, and its compliance note says in terms that a
// published claim has to survive an Australian Consumer Law challenge on
// substantiation. What is rendered instead is what the data does support: the
// ladder position, and the dollars to the next rung.
//
// A HIDDEN PRICE HIDES ALL OF IT. `products.hide_price` masks the purchase
// amounts in the shared provider; publishing more prices beside a suppressed one
// would not suppress anything, so the panel returns null.
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import { adjustForGst } from "@keenan/services/calc";
import { useGst } from "@/lib/gst";
import { bestVisiblePrice } from "@/lib/finance/product-finance";
import {
  formatWholeDollars,
  isChargedAmount,
  pricesForVariant,
  type CdMembershipData,
} from "@/lib/pricing/cd-member-pricing";

/** Ex-GST money in, the figure this shopper's GST switch says, out. */
function useMoney() {
  const { inclusive, pricesIncludeTax } = useGst();
  return (value: number) =>
    `$${adjustForGst(value, inclusive, pricesIncludeTax).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
}

function PriceRow({
  label,
  amount,
  note,
  emphasis,
}: {
  label: string;
  amount: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-text-secondary">
        {label}
        {note ? <span className="ml-1 text-xs text-text-muted">{note}</span> : null}
      </span>
      <span
        className={
          emphasis
            ? "text-lg font-bold tabular-nums text-text-primary"
            : "text-sm font-medium tabular-nums text-text-secondary"
        }
      >
        {amount}
      </span>
    </div>
  );
}

export function CdMemberPricingPanel({ data }: { data: CdMembershipData | null }) {
  const purchase = useProductPurchase();
  const money = useMoney();
  const { inclusive, pricesIncludeTax } = useGst();

  if (!data) return null;
  // A product whose price is hidden hides these figures and the widget with
  // them — see the header note.
  if (purchase.hidePrice) return null;
  // A product with no price at all sells by quote; there is nothing to ladder.
  if (!(purchase.displayPrice > 0) && !(purchase.displaySalePrice ?? 0)) return null;

  const prices = pricesForVariant(data, purchase.activeVariantId);
  // No trade row for this variant: nothing to show. Never a partial claim.
  if (!prices) return null;

  // What the buy box is charging for ONE unit of the product itself.
  //
  // `bestVisiblePrice` is not a local opinion: it is the SAME function the buy
  // box's own save ladder and the SilverChef weekly panel read, so the figure
  // this panel compares against is by construction the figure printed a
  // centimetre above it. A member price arrives on its own channel
  // (`activeMemberPrice`) rather than as a sale price, which is why reading the
  // sale pair alone missed it.
  //
  // The BASE amounts, so a ticked $480 blade set does not make every row here
  // read as wrong; the extras are taken back off the member price for the same
  // reason. Normalised to ex GST because the ladder's figures are ex GST.
  const memberBase =
    purchase.activeMemberPrice == null ? null : purchase.activeMemberPrice - purchase.addonTotal;
  const chargedRaw = bestVisiblePrice({
    displayPrice: purchase.displayBasePrice,
    displaySalePrice: purchase.displayBaseSalePrice,
    memberPrice: memberBase,
  });
  const chargedExGst =
    Number.isFinite(chargedRaw) && chargedRaw > 0
      ? pricesIncludeTax
        ? chargedRaw / 1.1
        : chargedRaw
      : null;

  // WHICH ROWS ARE TRUE depends on what this channel advertises, and only true
  // rows are rendered.
  //
  //  - `catalogue` (today, and the only live setting): the shopper pays the
  //    channel's own catalogue price, so RRP is real and M is a trade price
  //    nobody on this site can buy at. RRP + member price.
  //  - `mates`: the ladder has replaced the advertised price with M, so
  //    `payload.product.price` IS the Mates Rates figure and the page no longer
  //    carries an RRP for this panel to quote. Mates Rates + member price.
  //    Restoring the third row means the page's own headline chip stops saying
  //    "RRP" first — `components/ui/PriceBlock.tsx`, which is card gk23c1VK's
  //    work and part of the same switch. Printing a second, different "RRP"
  //    beside a headline chip that still says RRP would make the screen
  //    contradict itself, which is the failure this panel already had once.
  const showMates = data.advertisesMates && prices.mates != null;
  const showRrp = !data.advertisesMates && prices.rrp != null;

  // THE MEMBER ROW.
  //
  // For a MEMBER it is not a second opinion about their price — it IS the price
  // the buy box is charging, labelled with the rung that produced it. It renders
  // only while the page is charging at or under the ladder figure, which is what
  // "the ladder is pricing this shopper" means: on the nose normally, under it
  // when a clearance or a contract price beat the ladder (the engine takes the
  // better of the two and never stacks them). Charged ABOVE the ladder figure
  // means the ladder is NOT in force for this shopper, and the panel says
  // nothing rather than print a member price they are not being given. One
  // machine, one member price, on every one of our screens.
  //
  // For everyone else it is the ENTRY rung — what joining would buy today —
  // labelled as such and never as an offer. A guest is still charged the
  // standard price (`sf-product-page`: a guest is never PRICED at a member tier).
  const memberCharged =
    data.isMember && prices.member != null && chargedExGst != null
      ? chargedExGst <= prices.member + 0.005
      : false;
  const memberAmount = data.isMember ? (memberCharged ? chargedExGst : null) : prices.member;
  const showMember = memberAmount != null;

  // THE TOP-TIER ROW — the card's third figure, and the deep end of the range.
  //
  // It is the ladder's price for THIS SKU at the last configured rung, read from
  // the engine at that level. It is suppressed only when it would repeat a row
  // already on screen: a member already at the deepest rung is looking at their
  // own price, and printing it twice under two labels reads as two prices for
  // one machine — the failure this panel is fenced against.
  const deepestIsDuplicate =
    data.atDeepestLevel ||
    (memberAmount != null && Math.abs((prices.deepest ?? NaN) - memberAmount) < 0.005);
  const showDeepest = prices.deepest != null && !deepestIsDuplicate;

  if (!showMember && !showMates && !showRrp && !showDeepest) return null;

  const gstLabel = inclusive ? "inc GST" : "ex GST";
  const paying = "what you pay today";
  const rrpIsCharged = showRrp && isChargedAmount(prices.rrp, chargedExGst);
  const matesIsCharged = showMates && isChargedAmount(prices.mates, chargedExGst);
  const deepestIsCharged = showDeepest && isChargedAmount(prices.deepest, chargedExGst);

  const reachedIndex = data.levelIndex;
  const railFill = data.ladder.length > 1 ? (reachedIndex / (data.ladder.length - 1)) * 100 : 0;

  return (
    <section
      className="mt-4 rounded-[12px] border border-border bg-white p-4"
      aria-label="Chefs Depot member pricing"
    >
      <div className="divide-y divide-border">
        {showRrp && (
          <PriceRow
            label="RRP"
            amount={money(prices.rrp as number)}
            note={rrpIsCharged ? paying : undefined}
            emphasis={rrpIsCharged}
          />
        )}
        {showMates && (
          <PriceRow
            label="Mates Rates"
            amount={money(prices.mates as number)}
            note={matesIsCharged ? paying : undefined}
            emphasis={matesIsCharged}
          />
        )}
        {showMember && (
          <PriceRow
            label={data.isMember ? `Your member price · ${data.levelLabel}` : "Member price"}
            amount={money(memberAmount as number)}
            note={data.isMember ? paying : `${data.levelLabel} — what joining buys today`}
            emphasis={data.isMember}
          />
        )}
        {showDeepest && (
          <PriceRow
            label={`Our deepest trade price · ${data.deepestLevelLabel}`}
            amount={money(prices.deepest as number)}
            note={deepestIsCharged ? paying : "at the top of the ladder"}
            emphasis={deepestIsCharged}
          />
        )}
      </div>
      <p className="mt-1 text-right text-xs text-text-muted">{gstLabel}</p>

      {/* ── the spend-more-save-more widget ─────────────────────────────── */}
      <div className="mt-4 rounded-[10px] bg-member-bg p-4">
        <p className="text-sm font-bold text-text-primary">
          {data.ladder.length} levels, one direction
        </p>

        <div className="relative mt-5 h-6" aria-hidden="true">
          <div className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-border" />
          <div
            className="absolute left-0 top-2.5 h-1 rounded-full bg-member"
            style={{ width: `${railFill}%` }}
          />
          {data.ladder.map((step, index) => {
            const left = data.ladder.length > 1 ? (index / (data.ladder.length - 1)) * 100 : 0;
            return (
              <span key={step.id}>
                <span
                  className={`absolute top-1.5 -ml-1 h-2 w-2 rounded-full ${
                    step.reached ? "bg-member" : "bg-border"
                  }`}
                  style={{ left: `${left}%` }}
                />
                <span
                  className="absolute top-5 -translate-x-1/2 text-[9px] tabular-nums text-text-muted"
                  style={{ left: `${left}%` }}
                >
                  {step.id}
                </span>
              </span>
            );
          })}
        </div>

        {/* THE RANGE, IN DOLLARS. The card asks for the min and max available on
            spend; the honest form of that on this system is the two ends of the
            ladder priced for the SKU on screen, because the distance between
            them differs product by product. Tim's own end labels, now carrying
            the figures they name. A figure the engine did not return is simply
            absent — the label still stands. */}
        <div className="mt-6 flex justify-between gap-3 text-[11px] text-text-muted">
          <span>
            Where member pricing starts
            {prices.entry != null && (
              <b className="mt-0.5 block text-[13px] tabular-nums text-text-primary">
                {money(prices.entry)}
              </b>
            )}
          </span>
          <span className="text-right">
            Our deepest trade price
            {prices.deepest != null && (
              <b className="mt-0.5 block text-[13px] tabular-nums text-text-primary">
                {money(prices.deepest)}
              </b>
            )}
          </span>
        </div>

        {/* What the ladder means for THIS shopper. A member gets their own
            position and the dollars to the next rung; a visitor gets the pitch.
            Neither gets a percentage. */}
        {data.isMember ? (
          <p className="mt-3 text-sm text-text-secondary">
            You are on <strong className="text-text-primary">{data.levelLabel}</strong>
            {data.trailingSpend != null ? (
              <> with {formatWholeDollars(data.trailingSpend)} of rolling twelve-month spend</>
            ) : null}
            .{" "}
            {data.spendToNext != null && data.nextLevelLabel ? (
              data.spendToNext > 0 ? (
                <>
                  Another {formatWholeDollars(data.spendToNext)} takes you to{" "}
                  <strong className="text-text-primary">{data.nextLevelLabel}</strong>, and every
                  line on the site steps down with you.
                </>
              ) : (
                /* Spend already past the next threshold but the level has not moved
                   yet — levels come from the monthly review, never from live spend,
                   so the order being priced can never count toward its own price.
                   "Another $0 takes you to Level 5" is what the arithmetic says and
                   it reads as broken; what is actually true is that the next review
                   moves them. */
                <>
                  Your spend already reaches{" "}
                  <strong className="text-text-primary">{data.nextLevelLabel}</strong> — the next
                  monthly review moves you there.
                </>
              )
            ) : (
              <>You are at the deepest level the ladder goes.</>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            <strong className="text-text-primary">You&rsquo;re seeing our standard price.</strong>{" "}
            Members buy this line lower &mdash; and almost 40,000 others &mdash; lower again as
            their twelve-month spend grows.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          Levels are set by rolling twelve-month spend and reviewed on the first of each month. The
          distance between the ends differs product by product.
        </p>

        {/* The one membership CTA on this page — see the header note for why it
            has to be here rather than on the price block above. */}
        {!data.isMember && (
          <a
            href={data.joinHref}
            className="mt-4 inline-flex items-center justify-center rounded-[6px] bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {`Join the buying group — $${data.membershipMonthly.toLocaleString("en-AU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}/month`}
          </a>
        )}
      </div>
    </section>
  );
}
