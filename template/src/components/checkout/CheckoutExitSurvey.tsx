"use client";

// ============================================================================
// The checkout exit survey (card loDyEE3S).
//
// Tim, 2026-08-24: "If customers abandoned cart before leaving screen - As per
// Myer." The card's screenshots are Myer's abandon-intent pop-up and this is
// rebuilt from them: a single-choice reason list, then a 1-7 "how likely are
// you to come back", then a thank-you. The questions and options come from
// `@keenan/services/checkout-survey`, which is the same list the server
// validates against, so the pop-up cannot offer an answer the server refuses.
//
// IT IS A PROMPT, NEVER A GATE, and everything below is arranged around that:
//   * NO backdrop, and the card is kept OFF the controls that matter. On a
//     laptop it sits bottom-LEFT, over the form column, never over the
//     right-hand Order Summary that carries the Total and Place Order. On a
//     narrow screen the checkout is ONE column and that summary is the LAST
//     thing on the page, so while the pop-up is open the page is grown by
//     exactly the card's height — the Total, the button and its hint can always
//     be scrolled clear of it. That spacer is gated to the single-column case,
//     because at `lg` and up the summary is the right-hand column and nothing
//     is covered. A pop-up sitting on the one control the shopper needs is a
//     gate in everything but name (sf-checkout, "Do not break").
//     The same rule follows it off the checkout. Because the pop-up is mounted
//     in the LAYOUT it is asked on the page the shopper landed on, and that is
//     usually a product page, which carries a FIXED mobile buy bar below `lg`
//     holding the ex-GST price and Add to Cart (sf-product-page, card
//     33HGX8U2). A fixed bar does not scroll, so the flow spacer cannot save
//     it; instead the frame is measured off the bottom edge of the window by
//     that bar's own height (`measureBottomBar`), on whatever page it lands on.
//   * Nothing listens to `beforeunload`, cancels a click or delays a
//     navigation. Leaving is exactly as fast with the pop-up open as without.
//     That is why the question is asked AFTER an in-page departure rather than
//     before it: this component is mounted in the site LAYOUT, so it outlives
//     the checkout page, and the checkout's marker (`CheckoutExitSurveyArm`)
//     going away is the signal. Back, a link, a router move — the shopper is
//     already on the next page when they are asked, and nothing held them up.
//     Arming still happens ONLY from that marker, so the survey still cannot
//     reach the confirmation page, an empty basket or the IK sign-in gate.
//     A departure that reloads the whole document — Back across a hard page
//     load, a typed address — unmounts nothing, so the fact that this tab armed
//     a checkout is written into `sessionStorage` too and the pop-up asks on
//     whatever page the tab lands on next. Both shapes of leaving, one question.
//   * The X closes it, Escape closes it, and answering closes it. Whatever is
//     answered by then is filed; nothing is ever demanded.
//   * It NEVER arms on a submitted checkout — the checkout form announcing that
//     a press got past its own guards turns it off for good (see
//     `mayArmSurvey` and `CHECKOUT_SUBMITTED_EVENT`). Somebody who has just paid
//     is never asked why they did not, and an answer picked BEFORE they pressed
//     Pay is never filed afterwards either (see `file`). A press the checkout
//     REFUSED is not a submit and leaves the survey armed, which is the whole
//     point: that shopper is still here and still has a reason.
//   * An answer goes out as a BEACON, not as a server action, because the
//     shopper this survey is for is one whose page is going away — and a browser
//     cancels an ordinary fetch with the document.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CHECKOUT_SURVEY_LIKELIHOOD_HIGH,
  CHECKOUT_SURVEY_LIKELIHOOD_LOW,
  CHECKOUT_SURVEY_LIKELIHOOD_QUESTION,
  CHECKOUT_SURVEY_LIKELIHOOD_SCALE,
  CHECKOUT_SURVEY_REASONS,
  CHECKOUT_SURVEY_REASON_OTHER,
  CHECKOUT_SURVEY_REASON_QUESTION,
  CHECKOUT_SURVEY_THANKS,
} from "@keenan/services/checkout-survey";
import {
  bottomBarClearancePx,
  CHECKOUT_ARMED_EVENT,
  CHECKOUT_LEFT_EVENT,
  CHECKOUT_SUBMITTED_EVENT,
  checkoutIsOnScreen,
  EMPTY_SURVEY_DRAFT,
  EXIT_SURVEY_ARMED_KEY,
  EXIT_SURVEY_FRAME_GUTTER_PX,
  EXIT_SURVEY_OTHER_MAX_LENGTH,
  EXIT_SURVEY_SESSION_KEY,
  EXIT_SURVEY_SINGLE_COLUMN_QUERY,
  isExitIntent,
  mayArmSurvey,
  reservesFlowSpace,
  returnedFromLeaving,
  sendSurveyDraft,
  type SurveyDraft,
} from "@/lib/checkout/exit-survey";

type Step = "reason" | "likelihood" | "thanks";

/**
 * Measure the SITE's own fixed bottom bar on whatever page this pop-up has
 * landed on, so the card can be lifted clear of it.
 *
 * Found by hit-testing the bottom edge of the window rather than by matching a
 * class name: the three bars that exist today are a hand-written component on
 * Chefs Depot, an authored `mobile_buy_bar` widget on the Chefs Depot product
 * template and a builder seed on Industry Kitchens, and a fourth will be
 * authored by somebody who never reads this file. Anything genuinely pinned to
 * the bottom of the window is found; nothing has to opt in. `lg:hidden` bars
 * measure zero on a laptop because they are display:none, so the breakpoint
 * takes care of itself.
 *
 * Our own frame is `pointer-events-none` and is therefore already invisible to
 * `elementsFromPoint`; the card is excluded explicitly anyway, so the
 * measurement can never feed back on itself.
 */
function measureBottomBar(ours: HTMLElement | null): number {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
    return 0;
  }
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  if (!vh || !vw) return 0;
  const bars: { top: number; bottom: number }[] = [];
  // Three probes across the edge: a bar can be half-width, and the card sits
  // bottom-centre on a phone and bottom-LEFT from `sm` up.
  for (const x of [vw * 0.15, vw * 0.5, vw * 0.85]) {
    for (const hit of document.elementsFromPoint(x, vh - 1)) {
      let node: HTMLElement | null = hit as HTMLElement;
      while (node) {
        if (ours && (node === ours || ours.contains(node) || node.contains(ours))) break;
        if (window.getComputedStyle(node).position === "fixed") {
          bars.push(node.getBoundingClientRect());
          break;
        }
        node = node.parentElement;
      }
    }
  }
  return bottomBarClearancePx(bars, vh);
}

export function CheckoutExitSurvey() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [draft, setDraft] = useState<SurveyDraft>(EMPTY_SURVEY_DRAFT);
  /** Flow height added below the checkout so the card covers nothing for good. */
  const [reserve, setReserve] = useState(0);
  /** How far the card is lifted off the bottom edge to clear the SITE's own
   *  fixed bottom bar — the product page's mobile buy bar, today. Measured from
   *  the page the shopper actually landed on, never assumed. */
  const [barClear, setBarClear] = useState(0);

  // Refs, not state: the listeners below read these on every event and must
  // never re-subscribe (a re-subscribe mid-gesture drops the gesture).
  const draftRef = useRef(draft);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const armed = useRef(false);
  const submitted = useRef(false);
  const filed = useRef(false);
  /** True only while the checkout page's marker is mounted. The two ON-PAGE
   *  triggers (the pointer leaving through the top, the return from twenty
   *  seconds away) are questions asked of somebody still ON the checkout, so
   *  they are gated on this; the departure trigger is not, because by then the
   *  shopper has already left. */
  const onCheckout = useRef(false);

  /** File once, whatever has been answered. Fire and forget — closing this
   *  pop-up is never allowed to wait on the network. */
  const file = useCallback(() => {
    if (filed.current) return;
    // NEVER against a checkout that has been submitted. Somebody can open the
    // pop-up, tick "Delivery cost too high", change their mind, press Pay and
    // then switch tabs while Stripe confirms the card — and without this the
    // page going away would file an abandonment reason against an order they
    // actually placed. Same rule as `mayArmSurvey`, enforced at the other end.
    if (submitted.current) return;
    const d = draftRef.current;
    // Latch AFTER the empty check, not before: filing is also attempted when
    // the page goes away with nothing answered yet, and latching there would
    // silently throw away the answer that came afterwards.
    if (!d.reason && !d.likelihood) return;
    filed.current = true;
    // Beacon, not a server action: an ordinary fetch is cancelled when the
    // document goes away, which is precisely the moment this survey exists to
    // capture. See `sendSurveyDraft`.
    sendSurveyDraft(d);
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const dismiss = useCallback(() => {
    setOpen(false);
    file();
  }, [file]);

  useEffect(() => {
    const askedAlready = () => {
      try {
        return window.sessionStorage.getItem(EXIT_SURVEY_SESSION_KEY) === "1";
      } catch {
        // Private mode / blocked storage. Worst case the shopper is asked twice
        // in one session; never a reason to skip the survey outright.
        return false;
      }
    };

    const forget = () => {
      try {
        window.sessionStorage.removeItem(EXIT_SURVEY_ARMED_KEY);
      } catch {
        /* see above */
      }
    };

    const show = () => {
      if (!mayArmSurvey({ hasItems: true, submitted: submitted.current, alreadyDone: false }))
        return;
      if (!armed.current) return;
      armed.current = false;
      forget();
      try {
        window.sessionStorage.setItem(EXIT_SURVEY_SESSION_KEY, "1");
      } catch {
        /* see above */
      }
      setOpen(true);
    };

    // A priced checkout is on screen: past the empty-cart redirect, past the
    // sign-in gate, with a basket. That is the ONLY thing that arms the survey,
    // which is what keeps this layout-level pop-up off every other page —
    // including the confirmation page, which never renders the marker.
    // Re-read the session each time: a shopper can reach the checkout twice in
    // one visit, and a redirect-form 3-D Secure comes back as a fresh load.
    const onArmed = () => {
      onCheckout.current = true;
      armed.current = mayArmSurvey({
        hasItems: true,
        submitted: submitted.current,
        alreadyDone: askedAlready(),
      });
      // Remember it in the TAB as well as in memory. A departure that reloads
      // the document — Back across a hard page load, a typed address, a hard
      // link — unmounts nothing, so the next page has no memory of the checkout
      // at all unless it is written down here. See EXIT_SURVEY_ARMED_KEY.
      if (armed.current) {
        try {
          window.sessionStorage.setItem(EXIT_SURVEY_ARMED_KEY, "1");
        } catch {
          /* see above */
        }
      }
    };

    // …and the marker going away is the shopper LEAVING the checkout by an
    // ordinary in-page route: Back, a link, any router move. This is the
    // trigger the card was reopened for (Steve, 2026-09-17: "It does not pop up
    // anywhere when I go to leave from inside the checkout"). It fires AFTER
    // the navigation has happened, on the page they landed on, so it delays
    // nothing and cancels nothing — which is the one rule this component may
    // never break.
    const onLeft = () => {
      onCheckout.current = false;
      show();
    };

    // Desktop, still on the checkout: the pointer leaves through the top of the
    // window. Kept exactly as it was — it asks EARLIER than the departure does,
    // while the shopper can still change their mind.
    const onMouseOut = (e: MouseEvent) => {
      if (!onCheckout.current) return;
      if (isExitIntent({ clientY: e.clientY, relatedTarget: e.relatedTarget })) show();
    };

    // The page itself going away — closing the tab, typing an address, a hard
    // navigation. React runs no unmount for any of those, so there is no
    // departure event and nothing to ask on; all that is left to do is FILE
    // whatever was already answered. `pagehide` is the event that fires for all
    // of them (and on the back/forward cache path, where `unload` does not),
    // and it is a listener, never a gate: it returns nothing and blocks
    // nothing, unlike the `beforeunload` this component must never use.
    const onPageHide = () => file();

    // Touch: they left the page and came back. There is no hover on a phone, so
    // this is the only honest signal there — and it fires AFTER they return, so
    // it can never sit in front of somebody who is on their way out. The dwell
    // check is what keeps it off a shopper who flicked to their banking app for
    // a card number and came straight back (`returnedFromLeaving`).
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        // They are on their way out with an answer already picked. File it now
        // — this is the ONLY moment we get from a shopper who closes the tab,
        // presses Back or follows a link, which is exactly the population this
        // survey is aimed at. It goes out as a BEACON, which is what makes that
        // true: a plain fetch is cancelled with the document, so it would have
        // worked for a tab switch and quietly failed for a real departure. NOT
        // `beforeunload`, and nothing here waits, so it still delays nothing.
        file();
        return;
      }
      if (onCheckout.current && hiddenAt && returnedFromLeaving(Date.now() - hiddenAt)) show();
      hiddenAt = 0;
    };

    // The checkout SAYING an order is being placed turns the survey off for
    // good — not any old `submit` event on the page. A press of Place Order
    // that the checkout itself refuses (a blank or half-typed card, card
    // TT3DGpsE) fires a submit, places no order and leaves the shopper right
    // here: watching raw submits silenced the questionnaire for the rest of the
    // session for exactly the people whose answer is "Issues processing
    // payment" or "Technical issues with the site". `defaultPrevented` cannot
    // separate the two, because React calls `preventDefault()` on every submit
    // of a form with a function `action`. CheckoutForm dispatches this once a
    // press is past its own guards, which still covers a card confirmation —
    // that goes through the same form.
    const onSubmitted = () => {
      submitted.current = true;
      armed.current = false;
      // And take it off the screen if it is already there. `armed` only stops
      // it OPENING; a shopper who had the pop-up up, changed their mind and
      // pressed Pay would otherwise be left with an abandonment questionnaire
      // sitting in front of (or behind) Stripe's card confirmation. Closing
      // here files nothing — `file()` refuses once `submitted` is set, which is
      // the rule that a reason is never filed against an order that was placed.
      setOpen(false);
      // Stamped here as well as when the pop-up is shown: a card taking the
      // REDIRECT form of 3-D Secure leaves the site and comes back to
      // /checkout as a fresh page load, where `submitted` starts false again.
      // Without the stamp the survey would re-arm on somebody who has just
      // paid, which is the one thing it must never do.
      forget();
      try {
        window.sessionStorage.setItem(EXIT_SURVEY_SESSION_KEY, "1");
      } catch {
        /* see above */
      }
    };

    document.addEventListener(CHECKOUT_ARMED_EVENT, onArmed);
    document.addEventListener(CHECKOUT_LEFT_EVENT, onLeft);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener(CHECKOUT_SUBMITTED_EVENT, onSubmitted);
    window.addEventListener("pagehide", onPageHide);

    // React runs a CHILD's effects before its parent's, and this pop-up lives
    // in the layout while the marker lives on the page — so on a full load of
    // /checkout the marker has already announced itself by the time we
    // subscribe. Read the current state once rather than miss that first event.
    if (checkoutIsOnScreen()) {
      onArmed();
    } else {
      // No checkout on this page — but this TAB armed one, and the document it
      // was on has been torn down. That is the full-page half of leaving the
      // checkout, and it is the only route Back takes when the checkout was
      // reached by a hard page load rather than a link. Ask here, on the page
      // they landed on, exactly as the in-page route does.
      let leftOne = false;
      try {
        leftOne = window.sessionStorage.getItem(EXIT_SURVEY_ARMED_KEY) === "1";
      } catch {
        /* see above */
      }
      if (leftOne && !askedAlready()) {
        armed.current = true;
        show();
      }
    }

    return () => {
      document.removeEventListener(CHECKOUT_ARMED_EVENT, onArmed);
      document.removeEventListener(CHECKOUT_LEFT_EVENT, onLeft);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener(CHECKOUT_SUBMITTED_EVENT, onSubmitted);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [file]);

  // The page grows by exactly the card's height while the pop-up is open, so
  // nothing at the BOTTOM of the checkout can be left unreachable underneath
  // it. On a phone that bottom is the Order Summary, the Total, Place Order and
  // the hint that says why it is disabled — the one thing the sf-checkout
  // register says must never be taken away from a shopper.
  useEffect(() => {
    if (!open) {
      setReserve(0);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    // ONLY while the checkout is one column. At `lg` and up the Order Summary
    // is the right-hand column and the card is bottom-left, so nothing is
    // covered and a spacer there would just add dead page and jump the
    // scrollbar the moment the pop-up opens.
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia(EXIT_SURVEY_SINGLE_COLUMN_QUERY)
        : null;
    const measure = () => {
      // Lift the card clear of the site's own fixed bottom bar FIRST, then
      // reserve room for both. On the checkout there is no such bar and this is
      // zero; on the product page a shopper lands on after pressing Back it is
      // the mobile buy bar, and that bar does not scroll.
      const bar = measureBottomBar(frameRef.current);
      setBarClear(bar);
      setReserve(
        reservesFlowSpace(mq ? mq.matches : null)
          ? el.offsetHeight + EXIT_SURVEY_FRAME_GUTTER_PX + bar
          : 0
      );
    };
    measure();
    mq?.addEventListener?.("change", measure);
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      mq?.removeEventListener?.("change", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  const nextDisabled = step === "reason" ? !draft.reason : !draft.likelihood;
  const onNext = () => {
    if (step === "reason") {
      setStep("likelihood");
      return;
    }
    file();
    setStep("thanks");
  };

  return (
    <>
      {/* Grows the page by the card's height, in the single-column case only, so
          the checkout's own bottom — Order Summary, Total, Place Order, its
          hint — always scrolls clear. Zero at `lg` and up, where the card sits
          beside that column rather than under it. */}
      <div aria-hidden style={{ height: reserve }} />
      {/* No backdrop, and `pointer-events-none` on the frame so the checkout
          behind it stays clickable everywhere the card itself is not. */}
      <div
        ref={frameRef}
        // z-[120] clears the sticky site header (z-50 on Industry Kitchens and
        // the template, z-[100] on Chefs Depot) and its mega menu (z-[110]) —
        // under either of them the question and the close button hide behind the
        // header on a laptop screen — but stays UNDER the mobile
        // navigation drawer (z-[200]), which is a screen the shopper opened on
        // purpose and must not be covered.
        // Bottom-LEFT from `sm` up, never bottom-right: the Order Summary is the
        // right-hand column on this checkout, and it carries the Total, the
        // Place Order / Pay Now button and the sentence explaining why the button
        // is disabled. Covering those would break a rule card 7vu2iEEZ put on
        // this surface, and would make a prompt behave like a gate.
        className="pointer-events-none fixed inset-0 z-[120] flex items-end justify-center p-3 sm:justify-start sm:p-6"
        // The frame ENDS above the site's own fixed bottom bar rather than at
        // the bottom of the window, so the card cannot land on it. On the
        // product page a departing shopper is sent back to, that bar carries the
        // ex-GST price and Add to Cart — rules card 33HGX8U2 put on
        // sf-product-page — and it does not scroll, so the flow spacer below
        // cannot clear it. Zero everywhere there is no such bar, which includes
        // the checkout itself and every width at `lg` and up.
        style={barClear ? { bottom: barClear } : undefined}
        aria-live="polite"
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-label="Checkout survey"
          // A column with ONE scrolling part: the question and the Next button
          // stay in view however long the option list is, so the pop-up can never
          // present a list with no visible way out of it.
          className="pointer-events-auto flex max-h-[60vh] w-full flex-col rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/10 sm:max-h-[75vh] sm:w-[380px]"
        >
          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close survey"
              className="-mr-1 -mt-1 rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {step === "thanks" ? (
            <div className="shrink-0 pb-1 pt-2">
              <p className="text-center text-base font-semibold text-zinc-900">
                {CHECKOUT_SURVEY_THANKS}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-5 w-full rounded-lg bg-zinc-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          ) : step === "reason" ? (
            <>
              <p className="shrink-0 pr-2 text-base text-zinc-900">
                {CHECKOUT_SURVEY_REASON_QUESTION}
              </p>
              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {CHECKOUT_SURVEY_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={`flex cursor-pointer items-start gap-3 rounded-full border px-4 py-3 text-sm transition-colors ${
                      draft.reason === reason
                        ? "border-zinc-900 bg-zinc-50 text-zinc-900"
                        : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkout_survey_reason"
                      value={reason}
                      checked={draft.reason === reason}
                      onChange={() => setDraft((d) => ({ ...d, reason }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-900"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
              {draft.reason === CHECKOUT_SURVEY_REASON_OTHER && (
                <textarea
                  value={draft.other}
                  onChange={(e) => setDraft((d) => ({ ...d, other: e.target.value }))}
                  maxLength={EXIT_SURVEY_OTHER_MAX_LENGTH}
                  rows={3}
                  aria-label="Tell us more"
                  placeholder="Tell us more (optional)"
                  className="mt-3 w-full shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none"
                />
              )}
              <NextButton disabled={nextDisabled} onClick={onNext} />
            </>
          ) : (
            <>
              <p className="shrink-0 pr-2 text-base text-zinc-900">
                {CHECKOUT_SURVEY_LIKELIHOOD_QUESTION}
              </p>
              <div className="mt-4 flex shrink-0 justify-between gap-1">
                {CHECKOUT_SURVEY_LIKELIHOOD_SCALE.map((point) => (
                  <button
                    key={point}
                    type="button"
                    aria-pressed={draft.likelihood === point}
                    onClick={() => setDraft((d) => ({ ...d, likelihood: point }))}
                    className={`h-10 w-10 rounded-lg border text-sm font-medium transition-colors ${
                      draft.likelihood === point
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-transparent text-zinc-700 hover:border-zinc-300"
                    }`}
                  >
                    {point}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>{CHECKOUT_SURVEY_LIKELIHOOD_LOW}</span>
                <span>{CHECKOUT_SURVEY_LIKELIHOOD_HIGH}</span>
              </div>
              <NextButton disabled={nextDisabled} onClick={onNext} />
            </>
          )}
        </div>
        </div>
    </>
  );
}

function NextButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <div className="mt-5 flex shrink-0 justify-end">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        Next
      </button>
    </div>
  );
}
