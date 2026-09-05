// ============================================================================
// What a customer is told a line was CONFIGURED with — `order_items.product_options`,
// rendered under the product name on their own order page.
//
// Pure and unit-tested because the column holds two genuinely different shapes and this page
// silently rendered nothing for one of them (card 0CDcCYmO): a line priced hundreds of dollars
// above the catalogue had no explanation anywhere the BUYER could see, while the portal's own
// lines table printed it in full.
// ============================================================================

/**
 * Variant / option wording on a line, from the checkout's `product_options` snapshot.
 *
 * TWO SHAPES, both real, and the customer's copy of an order has to read whichever it holds:
 *
 *   * an ARRAY of `{ display_name, display_value }` — how Zoey-synced lines carry variant
 *     wording, and what this page was written against;
 *   * an OBJECT of `{ "Slicers": "Slicer 4mm, Slicer 6mm" }` — what the storefront checkout
 *     writes for the paid add-on extras a shopper ticks (card 0CDcCYmO). NO MONEY in the text,
 *     deliberately: this row prints to the customer directly above a GST-INCLUSIVE unit price
 *     and line total, and an ex-GST "+$245.00" beside a $269.50 inclusive figure is one of our
 *     own numbers contradicting another. The extras are already inside the line's price.
 *
 * The object shape used to read as nothing here, so a line priced hundreds of dollars above the
 * catalogue had no explanation anywhere the BUYER could see while the portal's own lines table
 * printed it in full.
 */
export function optionSummary(raw: unknown): string {
  const parts: string[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const name = String(o.display_name ?? o.name ?? "").trim();
      const value = String(o.display_value ?? o.value ?? "").trim();
      if (!value) continue;
      parts.push(name ? `${name}: ${value}` : value);
    }
  } else if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      // Only plain scalars: a nested bag has no wording we could print, and String({}) is
      // "[object Object]" on a customer's own order page.
      if (typeof value !== "string" && typeof value !== "number") continue;
      const text = String(value).trim();
      if (!text) continue;
      const label = name.trim();
      parts.push(label ? `${label}: ${text}` : text);
    }
  }

  return parts.join(" · ");
}
