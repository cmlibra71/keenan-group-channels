import type { FinanceApplyFunder } from "@keenan/services/finance";
import {
  FINANCE_APPLY_LOGOS,
  FINANCE_APPLY_LOGO_CLASSES,
} from "@/lib/finance/finance-apply-logo";

// ============================================================================
// The financier's masthead on the CODED apply page (card XlDVUsuC).
//
// The same mark, the same file and the same size the CMS page gets at render
// time (`lib/finance/finance-apply-logo.ts`) — one module owns both, so the
// coded body and the staff-editable page cannot drift into two different
// logos. This body only serves a channel whose apply page is not published in
// the CMS; today all four are, so this is the fallback.
//
// A plain <img>: the file is this site's own `public/finance/…`, so there is
// nothing for the optimiser to do (`lib/image-loader` passes a relative path
// straight through anyway).
// ============================================================================

export function FinanceApplyLogo({ funder }: { funder: FinanceApplyFunder }) {
  const logo = FINANCE_APPLY_LOGOS[funder];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo.src}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      className={FINANCE_APPLY_LOGO_CLASSES.join(" ")}
    />
  );
}
