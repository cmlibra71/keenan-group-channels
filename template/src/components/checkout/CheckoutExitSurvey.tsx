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
//   * Nothing listens to `beforeunload`, cancels a click or delays a
//     navigation. Leaving is exactly as fast with the pop-up open as without.
//   * The X closes it, Escape closes it, and answering closes it. Whatever is
//     answered by then is filed; nothing is ever demanded.
//   * It NEVER arms on a submitted checkout — one `submit` anywhere on the page
//     turns it off for good (see `mayArmSurvey`). Somebody who has just paid is
//     never asked why they did not, and an answer picked BEFORE they pressed Pay
//     is never filed afterwards either (see `file`).
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
  EMPTY_SURVEY_DRAFT,
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

export function CheckoutExitSurvey() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("reason");
  const [draft, setDraft] = useState<SurveyDraft>(EMPTY_SURVEY_DRAFT);
  /** Flow height added below the checkout so the card covers nothing for good. */
  const [reserve, setReserve] = useState(0);

  // Refs, not state: the listeners below read these on every event and must
  // never re-subscribe (a re-subscribe mid-gesture drops the gesture).
  const draftRef = useRef(draft);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const armed = useRef(false);
  const submitted = useRef(false);
  const filed = useRef(false);

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
    let alreadyDone = false;
    try {
      alreadyDone = window.sessionStorage.getItem(EXIT_SURVEY_SESSION_KEY) === "1";
    } catch {
      // Private mode / blocked storage. Worst case the shopper is asked twice
      // in one session; never a reason to skip the survey outright.
    }
    armed.current = mayArmSurvey({ hasItems: true, submitted: false, alreadyDone });
    if (!armed.current) return;

    const show = () => {
      if (!mayArmSurvey({ hasItems: true, submitted: submitted.current, alreadyDone: false }))
        return;
      if (!armed.current) return;
      armed.current = false;
      try {
        window.sessionStorage.setItem(EXIT_SURVEY_SESSION_KEY, "1");
      } catch {
        /* see above */
      }
      setOpen(true);
    };

    // Desktop: the pointer leaves through the top of the window.
    const onMouseOut = (e: MouseEvent) => {
      if (isExitIntent({ clientY: e.clientY, relatedTarget: e.relatedTarget })) show();
    };

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
      if (hiddenAt && returnedFromLeaving(Date.now() - hiddenAt)) show();
      hiddenAt = 0;
    };

    // One submit anywhere on this page and the survey is off for good: Place
    // Order posts through the checkout form, and a card payment confirms from
    // the same submit. Capture phase, so it is seen before React's handlers.
    const onSubmit = () => {
      submitted.current = true;
      armed.current = false;
      // Stamped here as well as when the pop-up is shown: a card taking the
      // REDIRECT form of 3-D Secure leaves the site and comes back to
      // /checkout as a fresh page load, where `submitted` starts false again.
      // Without the stamp the survey would re-arm on somebody who has just
      // paid, which is the one thing it must never do.
      try {
        window.sessionStorage.setItem(EXIT_SURVEY_SESSION_KEY, "1");
      } catch {
        /* see above */
      }
    };

    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

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
    const measure = () =>
      setReserve(
        reservesFlowSpace(mq ? mq.matches : null) ? el.offsetHeight + EXIT_SURVEY_FRAME_GUTTER_PX : 0
      );
    measure();
    mq?.addEventListener?.("change", measure);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      mq?.removeEventListener?.("change", measure);
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
        // z-[120] clears the sticky site header (z-[100]) and its mega menu
        // (z-[110]) — under either of them the question and the close button hide
        // behind the header on a laptop screen — but stays UNDER the mobile
        // navigation drawer (z-[200]), which is a screen the shopper opened on
        // purpose and must not be covered.
        // Bottom-LEFT from `sm` up, never bottom-right: the Order Summary is the
        // right-hand column on this checkout, and it carries the Total, the
        // Place Order / Pay Now button and the sentence explaining why the button
        // is disabled. Covering those would break a rule card 7vu2iEEZ put on
        // this surface, and would make a prompt behave like a gate.
        className="pointer-events-none fixed inset-0 z-[120] flex items-end justify-center p-3 sm:justify-start sm:p-6"
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
