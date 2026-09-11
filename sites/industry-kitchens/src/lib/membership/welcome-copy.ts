/**
 * What `/membership/welcome` (the "All Set" page every new member lands on, from the
 * subscribe page AND from the checkout join) says about MEMBER PRICING (card gk23c1VK).
 *
 * PURE — no session, no database, no `@/` aliases — so the page and its unit test read
 * the same sentences.
 *
 * WHY THIS EXISTS. The tile used to be hardcoded: "Save up to 25% on products across the
 * store." — a catalogue-wide saving percentage with no measured basis, shown to every
 * new member whether the member price scale was on or off. Tim's pack (master document
 * §8.2) forbids exactly that: no saving percentage may be published until the spread is
 * measured, and nothing may imply a new member saves on day one. With the scale ON a
 * member at $0 of spend pays the standard price, so the sentence would be false outright.
 *
 * Copy and engine turn on together, off the channel's own switch
 * (`getLadderConfig().enabled`), exactly like `joinPitch` in `free-trial-copy.ts`:
 *  - OFF (every channel today): the truthful cost-plus sentence the membership page and
 *    terms already use — member pricing is applied automatically, no code, no minimum.
 *  - ON: Tim's own directional line, "Members Spend More, Save More", which is true by
 *    construction and names no figure.
 *
 * Neither sentence may carry a percentage, a dollar figure, "save up to" or "off retail";
 * `welcome-copy.test.ts` pins that, and pins the page to this function.
 */

export interface WelcomePricingTile {
  /** The tile's heading. */
  title: string;
  /** One plain sentence under it. */
  body: string;
}

/** The member-pricing tile while the channel's member price scale is OFF. */
export const WELCOME_PRICING_OFF: WelcomePricingTile = {
  title: "Member-Exclusive Pricing",
  body: "Member pricing is now applied to your account automatically, with no code to enter and no minimum order.",
};

/** The member-pricing tile while the Chefs Depot member price scale is ON. */
export const WELCOME_PRICING_SCALE: WelcomePricingTile = {
  title: "Members Spend More, Save More",
  body: "Your member pricing moves with your rolling twelve-month spend: every dollar you spend as a member moves it a little further down.",
};

/** The tile for this channel's pricing: copy and engine turn on together. */
export function welcomePricingTile(scaleOn: boolean): WelcomePricingTile {
  return scaleOn ? WELCOME_PRICING_SCALE : WELCOME_PRICING_OFF;
}
