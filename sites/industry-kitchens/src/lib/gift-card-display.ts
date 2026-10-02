import { adjustForGst } from "@keenan/services/calc";

/**
 * "$45.45" — one of the gift card's face values (INC GST) as the Amount dropdown shows it, in the
 * shopper's current GST display mode, exactly as Zoey's does: $45.45 / $90.91 / $136.36 / $181.82 /
 * $227.27 / $454.55 while prices are "Excluding GST", $50.00 … $500.00 inc GST.
 */
export function giftCardAmountLabel(faceIncTax: string, inclusive: boolean): string {
  const n = adjustForGst(Number(faceIncTax), inclusive, true);
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
