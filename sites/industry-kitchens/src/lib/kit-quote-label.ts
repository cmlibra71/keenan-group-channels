// Audit D20 — the kit's Add to Quote words, editable as props on the template's product-kit node.
/** Today's button words — the defaults when the template's `product-kit` node sets no label (D20). */
export const KIT_QUOTE_LABEL_PRICED = "Add to Quote";
export const KIT_QUOTE_LABEL_UNPRICED = "Add to Quote — request pricing";

export interface KitQuoteLabels {
  /** A bundle Zoey priced (Zoey's own words). */
  priced?: string | null;
  /** A bundle with no Zoey price. */
  unpriced?: string | null;
}

/** The button words, from the template node's props when set (audit D20), else today's. */
export function kitQuoteLabel(zoeyPriced: boolean, labels?: KitQuoteLabels | null): string {
  const pick = (v: string | null | undefined, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  return zoeyPriced ? pick(labels?.priced, KIT_QUOTE_LABEL_PRICED) : pick(labels?.unpriced, KIT_QUOTE_LABEL_UNPRICED);
}

