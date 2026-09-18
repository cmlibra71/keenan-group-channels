"use client";

// ============================================================================
// "A priced checkout is on screen" (card loDyEE3S).
//
// This renders nothing. It exists so the exit survey can be mounted in the site
// LAYOUT — where it survives a route change — while still arming only on a real
// checkout: past the empty-cart redirect, past the Industry Kitchens sign-in
// gate, and never on the confirmation page. The checkout page renders this
// marker exactly where the pop-up itself used to sit.
//
// Its UNMOUNT is the departure. Pressing Back, clicking a link or any other
// in-page navigation away from /checkout unmounts this component, and that is
// what tells the pop-up to ask its question — after the navigation, on the page
// the shopper landed on. Nothing here delays, intercepts or cancels anything:
// by the time this cleanup runs, the shopper has already gone where they were
// going. That is the whole reason the survey works this way round.
//
// A full page unload (closing the tab, typing an address) does NOT run this
// cleanup and must not: React does not unmount on unload. That case is covered
// by `pagehide` in the pop-up, which FILES whatever was already answered rather
// than asking anything, because there is no page left to ask on.
// ============================================================================

import { useEffect } from "react";
import {
  announceCheckoutArmed,
  announceCheckoutLeft,
} from "@/lib/checkout/exit-survey";

export function CheckoutExitSurveyArm() {
  useEffect(() => {
    announceCheckoutArmed();
    return () => announceCheckoutLeft();
  }, []);

  return null;
}
