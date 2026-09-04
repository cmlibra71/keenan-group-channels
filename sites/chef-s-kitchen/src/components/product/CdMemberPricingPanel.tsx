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
// TWO THINGS RENDER HERE AND THEY ARE GATED SEPARATELY.
//
//   THE JOIN FUNNEL — Tim's pitch sentence and the Join button — renders on any
//   channel that sells a membership, to any non-member, WHETHER OR NOT the
//   ladder is switched on and whether or not this SKU has any ladder price. That
//   is not a preference: retiring the savings percentage takes channel 2's
//   stored `member-teaser-x25` box off the screen (its only condition is
//   `purchase.showMemberTeaser` = `memberSavingsPct > 0`) and the stored
//   `join-strip-x18` never fires for a Chefs Depot guest (`hasSave && !isMember`
//   — a guest has no member price). Gate this on the ladder too, as the first
//   cut did, and a Chefs Depot product page merges with NO membership call to
//   action at all. The register's `sf-product-page` rule says it in terms: the
//   join funnel is not gated on there being a member price.
//
//   THE PRICES wait for `channel_settings.cd_member_ladder`. They are money and
//   they merge dark.
//
// THE PAYMENT CLAIM IS MADE BY COMPARISON, NEVER BY ASSUMPTION. "What you pay
// today" is attached to whichever row equals the price the buy box is actually
// charging, and to none of them if none match. That is the guard: an earlier
// cut of this panel told every Chefs Depot visitor they paid the Mates Rates
// figure while the headline and the cart charged ~22% more, because the channel
// suppresses the shared sale price and a guest pays RRP. A label that is derived
// from the page's own number cannot drift from it.
//
// THE RRP ROW IS THE PAGE'S OWN HEADLINE AMOUNT FOR THE ACTIVE VARIANT, read
// from the purchase provider (`displayBasePrice` = `activeVariant.price ??
// product.price`) rather than handed down from the product row. On the 156 Chefs
// Depot products whose variants differ in price, a product-level RRP would sit
// beside per-variant ladder figures and a per-variant headline — "RRP $17,960"
// next to a $31,310 machine. Reading the same number the headline shows makes
// that impossible rather than unlikely.
//
// THE TOP-TIER PRICE AND THE RANGE ARE PUBLISHED AS FIGURES. The card asks for
// the "GMC / top-tier discount price" and for a widget naming the min and max
// available on spend. Both ends of the ladder are PRICES at a configured rung —
// read from the same engine at the first and last levels — so they are named in
// dollars, for the SKU on screen, without deriving a percentage.
//
// NO PERCENTAGE. Not per product, not site-wide. The M-to-R spread differs SKU
// by SKU, so there is no single discount percentage in this system and one
// cannot be derived; Tim's pack forbids publishing any figure until the spread
// distribution has been measured, and its compliance note says in terms that a
// published claim has to survive an Australian Consumer Law challenge on
// substantiation. What is rendered instead is what the data does support: the
// ladder position, and the dollars to the next rung.
//
// A HIDDEN PRICE HIDES ALL OF IT, THE PITCH INCLUDED. `products.hide_price`
// masks the purchase amounts in the shared provider; a product that sells by
// quote gets no join box, which is the rule Chefs Depot's own
// `components/ui/PriceBlock.tsx` already carries on `showJoin` ("no join box on
// a product with no price"; that file and `lib/member-policy.ts` exist only in
// `sites/chef-s-kitchen`). Nor is membership pitched at someone already on
// account pricing — they have a negotiated contract and `derivePriceDisplay`
// has never pitched to them either.
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import { adjustForGst } from "@keenan/services/calc";
import { useGst } from "@/lib/gst";
import { bestVisiblePrice } from "@/lib/finance/product-finance";
import {
  decidePriceRows,
  formatWholeDollars,
  pricesForVariant,
  type CdMembershipBase,
  type CdMembershipData,
  type CdMembershipLadder,
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

/**
 * Tim's "Product page price note", verbatim (gk23c1VK attachment
 * `05-widget-kit.html`; his model approved 2026-08-24). The same sentence Chefs
 * Depot's `components/ui/PriceBlock.tsx` already carries on the surfaces IT
 * draws, so one storefront never shows two versions of his copy. He owns these
 * words — do not reword them.
 */
function JoinPitch() {
  return (
    <p className="text-sm text-text-secondary">
      <strong className="text-text-primary">You&rsquo;re seeing our standard price.</strong>{" "}
      Members buy this line lower &mdash; and almost 40,000 others &mdash; lower again as their
      twelve-month spend grows.
    </p>
  );
}

/**
 * The one membership CTA on a Chefs Depot product page — see the header note for
 * why it has to be here rather than on the price block above.
 */
function JoinButton({ data }: { data: CdMembershipBase }) {
  return (
    <a
      href={data.joinHref}
      className="mt-4 inline-flex items-center justify-center rounded-[6px] bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
    >
      {`Join the buying group — $${data.membershipMonthly.toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}/month`}
    </a>
  );
}

/**
 * The funnel on its own, with no prices under it. This is what a Chefs Depot
 * product page carries TODAY, on every channel with the ladder unwritten, and it
 * is the box that replaces the retired "Members save up to X%" teaser.
 */
function MembershipPitchPanel({ data }: { data: CdMembershipBase }) {
  return (
    <section
      className="mt-4 rounded-[12px] bg-member-bg p-4"
      aria-label="Chefs Depot membership"
    >
      <JoinPitch />
      <JoinButton data={data} />
    </section>
  );
}

function CdLadderPanel({ data }: { data: CdMembershipLadder }) {
  const purchase = useProductPurchase();
  const money = useMoney();
  const { inclusive, pricesIncludeTax } = useGst();

  const exGst = (value: number | null) =>
    value != null && Number.isFinite(value) && value > 0
      ? pricesIncludeTax
        ? value / 1.1
        : value
      : null;

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
  const chargedExGst = exGst(
    bestVisiblePrice({
      displayPrice: purchase.displayBasePrice,
      displaySalePrice: purchase.displayBaseSalePrice,
      memberPrice: memberBase,
    })
  );
  // The RRP row IS the headline's own base amount for the variant on screen —
  // see the header note.
  const rrpExGst = exGst(purchase.displayBasePrice);

  const prices = pricesForVariant(data, purchase.activeVariantId);
  const rows = decidePriceRows({ data, prices, rrpExGst, chargedExGst });

  // No trade row for this variant, or nothing true to publish for it — a HELD
  // SKU, or a multi-variant product with nothing picked yet. The prices stand
  // down; the funnel does not.
  if (!prices || !rows.anyRow) {
    return data.isMember ? null : <MembershipPitchPanel data={data} />;
  }

  const gstLabel = inclusive ? "inc GST" : "ex GST";
  const paying = "what you pay today";
  const railFill =
    data.ladder.length > 1 ? (data.levelIndex / (data.ladder.length - 1)) * 100 : 0;

  return (
    <section
      className="mt-4 rounded-[12px] border border-border bg-white p-4"
      aria-label="Chefs Depot member pricing"
    >
      <div className="divide-y divide-border">
        {rows.showRrp && (
          <PriceRow
            label="RRP"
            amount={money(rrpExGst as number)}
            note={rows.rrpIsCharged ? paying : undefined}
            emphasis={rows.rrpIsCharged}
          />
        )}
        {rows.showMates && (
          <PriceRow
            label="Mates Rates"
            amount={money(prices.mates as number)}
            note={rows.matesIsCharged ? paying : undefined}
            emphasis={rows.matesIsCharged}
          />
        )}
        {rows.showMember && (
          <PriceRow
            label={data.isMember ? `Your member price · ${data.levelLabel}` : "Member price"}
            amount={money(rows.memberAmount as number)}
            note={data.isMember ? paying : `${data.levelLabel} — what joining buys today`}
            emphasis={data.isMember}
          />
        )}
        {rows.showDeepest && (
          <PriceRow
            label={`Our deepest trade price · ${data.deepestLevelLabel}`}
            amount={money(prices.deepest as number)}
            note={rows.deepestIsCharged ? paying : "at the top of the ladder"}
            emphasis={rows.deepestIsCharged}
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
          <div className="mt-3">
            <JoinPitch />
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          Levels are set by rolling twelve-month spend and reviewed on the first of each month. The
          distance between the ends differs product by product.
        </p>

        {!data.isMember && <JoinButton data={data} />}
      </div>
    </section>
  );
}

export function CdMemberPricingPanel({ data }: { data: CdMembershipData | null }) {
  const purchase = useProductPurchase();

  if (!data) return null;
  // A product whose price is hidden hides these figures, the widget and the
  // join box with them — see the header note.
  if (purchase.hidePrice) return null;
  // A product with no price at all sells by quote; there is nothing to ladder
  // and nothing to pitch against.
  if (!(purchase.displayPrice > 0) && !(purchase.displaySalePrice ?? 0)) return null;
  // Someone on a negotiated contract price is not a join target, exactly as
  // `derivePriceDisplay` has always had it.
  if (purchase.accountPricing && !data.isMember) return null;

  if (!data.ladderEnabled) return <MembershipPitchPanel data={data} />;
  return <CdLadderPanel data={data} />;
}
