"use client";

import Link from "next/link";
import { useState } from "react";
import { Crown } from "lucide-react";
import {
  MEMBERSHIP_DOB_FIELD,
  MEMBERSHIP_JOIN_FIELD,
  MEMBERSHIP_JOIN_NOTHING_CHARGED,
  MEMBERSHIP_JOIN_PITCH,
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
 * TWO RULES FROM OTHER CARDS BIND EVERY WORD HERE, and both are in the behaviour register under
 * `sf-checkout`:
 *
 *  1. **No estimated saving.** Card Nyp8bkPm deleted "Members save up to $X on this order" from
 *     the cart and the checkout: it was the basket times a flat percentage, Tim's model prices a
 *     member by interpolating between two trade prices whose spread differs SKU by SKU, and his
 *     compliance note makes an unsubstantiated published claim a hard no. The pitch, the crown,
 *     the plan price and the join CTA all stand; the invented figure does not. The copy below is
 *     his, verbatim, and its order-exclusive phrasing is deliberate — membership reprices from the
 *     NEXT order, not this one. The MEMBER's own line ("You're saving $X with your membership on
 *     this order") is a measured figure and is untouched.
 *  2. **Nothing on this panel charges anybody.** It sits beside a Pay Now button, so it says so in
 *     plain words, and the order total in the summary above is unaffected by ticking the box.
 */
export function MembershipJoinPanel({
  isMember,
  memberSavings,
  planPriceLine,
  planName,
  isSignedIn,
  contactEmail,
}: {
  /** Already paid for a membership — the confirmation face. */
  isMember: boolean;
  /** What the membership actually saved on THIS order: list value minus what is charged. */
  memberSavings: number;
  /** "$14.95 per month", off the plan — null when the plan carries no usable price. */
  planPriceLine: string | null;
  planName: string;
  isSignedIn: boolean;
  /** The email the order will be placed under — where the activation link is sent. */
  contactEmail: string;
}) {
  const [joining, setJoining] = useState(false);

  // The member's own confirmation, in the rail where Myer puts its green "Congratulations, you are
  // now a MYER one Member." The sentence itself is the measured one the register protects.
  if (isMember) {
    return (
      <div className="mt-6 rounded-lg border border-brand-light/40 bg-brand-tint p-5">
        <div className="flex items-start gap-3">
          <Crown className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="font-semibold text-brand-deep">You&apos;re a member</p>
            <p className="mt-1 text-sm text-brand-deep">
              {memberSavings > 0
                ? `You're saving $${memberSavings.toFixed(2)} with your membership on this order`
                : "Member pricing is already applied to this order."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-member/40 bg-member-bg p-5">
      <div className="flex items-start gap-3">
        <Crown className="mt-0.5 h-5 w-5 shrink-0 text-member-text" />
        <div className="min-w-0">
          <p className="font-semibold text-member-text">Buying for a commercial kitchen?</p>
          <p className="mt-1 text-sm text-member-text">{MEMBERSHIP_JOIN_PITCH}</p>
          {planPriceLine && (
            <p className="mt-1 text-sm text-member-text">{planPriceLine}. Cancel any time.</p>
          )}
          {/* The old amber banner's "Join now" link to /membership. The tick below is the new way
              IN, but a shopper still has to be able to go and READ what the membership is before
              agreeing to pay for it — dropping the link with the banner would have left the price
              with nothing behind it. */}
          <p className="mt-1 text-sm">
            <Link href="/membership" className="font-medium text-member-text underline hover:no-underline">
              What&apos;s included
            </Link>
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-lg border border-member/40 bg-white p-3">
        <input
          type="checkbox"
          name={MEMBERSHIP_JOIN_FIELD}
          checked={joining}
          onChange={(e) => setJoining(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-steel-300 accent-brand"
        />
        <span className="text-sm font-medium text-ink-900">Join {planName}</span>
      </label>

      {joining && (
        <div className="mt-4 space-y-4 rounded-lg bg-white p-4">
          {/* Myer's "Contact Details" box with its Change link. Ours reads back rather than
              re-asks: the boxes are on this same page, so there is nothing to retype and nothing
              that can end up disagreeing with the order. */}
          <div>
            <p className="text-sm text-text-secondary">
              We&apos;ll use the name and address you entered for this order.
            </p>
            {contactEmail && (
              <p className="mt-1 truncate text-sm font-medium text-ink-900" title={contactEmail}>
                {contactEmail}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={MEMBERSHIP_DOB_FIELD} className="block text-sm font-medium text-ink-700">
              Date of birth (optional)
            </label>
            <input
              id={MEMBERSHIP_DOB_FIELD}
              name={MEMBERSHIP_DOB_FIELD}
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              placeholder="DD/MM/YYYY"
              className="mt-1 block w-full rounded-lg border border-steel-300 px-3 py-2 text-sm focus:border-steel-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-steel-500">
              So we can send you something on your birthday. Leave it blank if you&apos;d rather not.
            </p>
          </div>

          {/* The money sentence. It is what lets this panel sit beside a Pay Now button. */}
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-text-secondary">
            {MEMBERSHIP_JOIN_NOTHING_CHARGED}
          </p>
        </div>
      )}

      {!isSignedIn && (
        <p className="mt-3 text-xs text-member-text">
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
