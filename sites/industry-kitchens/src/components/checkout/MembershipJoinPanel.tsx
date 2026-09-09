"use client";

import Link from "next/link";
import { useState } from "react";
import { Crown } from "lucide-react";
import {
  MEMBERSHIP_DOB_FIELD,
  MEMBERSHIP_JOIN_FIELD,
  MEMBERSHIP_JOIN_NOTHING_CHARGED,
} from "@/lib/membership/checkout-join";

/**
 * The membership panel in the Order Summary rail. Card pktBo874.
 *
 * Tim's screenshot "Membership Real Estate" is our own checkout with a large empty area under the
 * Order Summary card and the Pay Now button; his reference is Myer's checkout, where the
 * membership panel sits in exactly that space. This is that panel, and it REPLACES the two thin
 * banners that ran across the top of the page — one place on the screen talks about membership,
 * not two.
 *
 * THREE RULES FROM OTHER CARDS BIND EVERY WORD HERE, and all three are in the behaviour register
 * under `sf-checkout`:
 *
 *  1. **No estimated saving.** Card Nyp8bkPm deleted "Members save up to $X on this order" from
 *     the cart and the checkout: it was the basket times a flat percentage, Tim's model prices a
 *     member by interpolating between two trade prices whose spread differs SKU by SKU, and his
 *     compliance note makes an unsubstantiated published claim a hard no. The pitch, the crown,
 *     the plan price and the join CTA all stand; the invented figure does not.
 *  2. **This panel writes no sentence of its own about the membership money.** Card ASTb3tCf owns
 *     the wording — `checkoutOfferCopy` for all four join states and `memberStateLine` for the
 *     member's own line — and this component renders what those return. That is how the promise
 *     made here is the promise the subscribe page honours, and it is why a second copy of the
 *     free-membership sentences may never grow inside this file.
 *  3. **Nothing on this panel charges anybody, and it never links to the payment page.** It sits
 *     beside a Pay Now button, so it says so in plain words, and the order total in the summary
 *     above is unaffected by ticking the box. Its only link is `/membership`, in every state —
 *     which satisfies that card's free-link rule by construction, because the way IN here is the
 *     tick, and the free period is re-decided server-side by `createSubscription` later.
 */
export function MembershipJoinPanel({
  memberLine,
  join,
  planPriceLine,
  planName,
  isSignedIn,
  contactEmail,
}: {
  /**
   * The member's own line, already written by `memberStateLine` (card ASTb3tCf, item 4). Non-null
   * exactly when this shopper is a member, and it carries the MEASURED saving where the basket has
   * one and their membership number where we hold it.
   */
  memberLine: string | null;
  /**
   * The join offer in card ASTb3tCf's own words (`checkoutOfferCopy`). Null for a member. Rendered
   * as given: `headline` leads, `detail` is the one sentence under it, `cta` labels the tick, and
   * `highlight` is the only thing that decides whether this panel dresses itself as good news.
   */
  join: { headline: string; detail: string | null; cta: string; highlight: boolean } | null;
  /** "$14.95 per month", off the plan — null when the plan carries no usable price. */
  planPriceLine: string | null;
  planName: string;
  isSignedIn: boolean;
  /** The email the order will be placed under — where the activation link is sent. */
  contactEmail: string;
}) {
  const [joining, setJoining] = useState(false);

  // The member's own confirmation, in the rail where Myer puts its green "Congratulations, you are
  // now a MYER one Member."
  if (memberLine) {
    return (
      <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
        <div className="flex items-start gap-3">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div>
            <p className="font-semibold text-green-900">You&apos;re a member</p>
            <p className="mt-1 text-sm text-green-800">{memberLine}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!join) return null;

  // Good news, or the plain pitch. `highlight` is decided in the wording module, not here: "is it
  // free" and "may we promise it to THIS visitor" are different questions, and a signed-out
  // shopper on Chefs Depot is exactly the case where they come apart.
  const free = join.highlight;

  return (
    <div className={`mt-6 rounded-lg border p-5 ${free ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        <Crown className={`mt-0.5 h-5 w-5 shrink-0 ${free ? "text-green-600" : "text-amber-600"}`} />
        <div className="min-w-0">
          <p className={`font-semibold ${free ? "text-green-900" : "text-amber-900"}`}>{join.headline}</p>
          {join.detail && (
            <p className={`mt-1 text-sm ${free ? "text-green-800" : "text-amber-800"}`}>{join.detail}</p>
          )}
          {/* What the membership costs. Suppressed in the FREE state, where the detail sentence
              above already says what happens when the free months end — two money sentences about
              one membership, one of them flat and one of them dated, is the contradiction the
              register refuses. */}
          {!free && planPriceLine && (
            <p className="mt-1 text-sm text-amber-700">
              {planName} — {planPriceLine}. Cancel any time.
            </p>
          )}
          {/* The old amber banner's "Join now" link to /membership. The tick below is the new way
              IN, but a shopper still has to be able to go and READ what the membership is before
              agreeing to pay for it — dropping the link with the banner would have left the price
              with nothing behind it. It points at /membership in every state, never at the
              subscribe page. */}
          <p className="mt-1 text-sm">
            <Link
              href="/membership"
              className={`font-medium underline hover:no-underline ${free ? "text-green-800" : "text-amber-800"}`}
            >
              What&apos;s included
            </Link>
          </p>
        </div>
      </div>

      <label
        className={`mt-4 flex items-start gap-3 rounded-lg border bg-white p-3 ${
          free ? "border-green-200" : "border-amber-200"
        }`}
      >
        <input
          type="checkbox"
          name={MEMBERSHIP_JOIN_FIELD}
          checked={joining}
          onChange={(e) => setJoining(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900"
        />
        {/* The label card ASTb3tCf asks for ("a Join members button on the checkout"), in the
            placement this card owns — under the Order Summary and under Pay Now. In the free
            state it says what is actually on the table instead. */}
        <span className="text-sm font-medium text-zinc-900">{join.cta}</span>
      </label>

      {joining && (
        <div className="mt-4 space-y-4 rounded-lg bg-white p-4">
          {/* Myer's "Contact Details" box with its Change link. Ours reads back rather than
              re-asks: the boxes are on this same page, so there is nothing to retype and nothing
              that can end up disagreeing with the order. */}
          <div>
            <p className="text-sm text-zinc-600">
              We&apos;ll use the name and address you entered for this order.
            </p>
            {contactEmail && (
              <p className="mt-1 truncate text-sm font-medium text-zinc-900" title={contactEmail}>
                {contactEmail}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={MEMBERSHIP_DOB_FIELD} className="block text-sm font-medium text-zinc-700">
              Date of birth (optional)
            </label>
            <input
              id={MEMBERSHIP_DOB_FIELD}
              name={MEMBERSHIP_DOB_FIELD}
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              placeholder="DD/MM/YYYY"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              So we can send you something on your birthday. Leave it blank if you&apos;d rather not.
            </p>
          </div>

          {/* The money sentence. It is what lets this panel sit beside a Pay Now button. */}
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{MEMBERSHIP_JOIN_NOTHING_CHARGED}</p>
        </div>
      )}

      {/* The "already a member" line. Only for a signed-out shopper: a signed-in one who is
          reading this panel is demonstrably NOT a member, and telling them otherwise would be
          false on the screen where they are spending money. */}
      {!isSignedIn && (
        <p className={`mt-3 text-xs ${free ? "text-green-800" : "text-amber-800"}`}>
          Already a member?{" "}
          <Link
            href="/account?next=%2Fcheckout"
            className="font-medium underline hover:no-underline"
          >
            Sign in
          </Link>{" "}
          so your member prices apply.
        </p>
      )}

    </div>
  );
}
