// ============================================================================
// Which rows the compare page prints, and what each cell says (IK parity,
// root cause `compare-feature`).
//
// ZOEY'S RULE. Magento's compare page lists every attribute flagged
// `is_comparable`, in attribute order, and hides a row that NONE of the compared
// products carries; a product without a value in a row that another product has
// reads "N/A". Read off the old site on 2026-09-28 with two combi ovens in the
// list: Description, Short Description, SKU, Trays per oven, Tray Size,
// Fuel Type ("N/A" for the Alto-Shaam, "Electric" for the CAPIC), Brand, then
// the price and ADD TO BASKET.
//
// HERE the attributes are the Zoey attribute Custom Fields the ingestor imports
// for Industry Kitchens (`custom_field_definitions`, product, channel 1; values
// in `metafields.fields`). A definition carries no "comparable" flag of its own,
// so the flag is carried HERE as the list of Zoey attribute codes Zoey marks
// comparable (the `.parity-data/zoey-variables.json` inventory,
// `zoey_attribute.comparable`), matched on the definition's `source_id`
// (`product-attr:<zoey code>`) — which survives the renames the import made
// (`type` → `equipment_type`, `width_1` → `width`). SKU and Brand are comparable
// in Zoey too; they come off the product row, not a Custom Field.
//
// PURE — the server page feeds it rows; `compare-rows.test.ts` pins the rule.
// ============================================================================

/**
 * The Zoey attribute codes Zoey flags `is_comparable`, other than `sku` and
 * `brand_1` (printed from the product row). Some have no live values today; they
 * cost nothing, and a row appears the day a product carries one.
 */
/**
 * The Zoey attributes the compare page shows by default — now owned by services (D18) beside the
 * per-definition "Show on compare page" flag. Re-exported for existing readers and tests.
 */
import { comparableDefinitionsInOrder, DEFAULT_COMPARABLE_ZOEY_ATTRIBUTES } from "@keenan/services/catalog-compare";

export const COMPARABLE_ZOEY_ATTRIBUTES: ReadonlySet<string> = DEFAULT_COMPARABLE_ZOEY_ATTRIBUTES;

/** What Zoey prints in a cell the product has no value for. */
export const MISSING_VALUE = "N/A";

const SOURCE_PREFIX = "product-attr:";

/** A product Custom Field definition, as read from `custom_field_definitions`. */
export interface CompareFieldDefinition {
  code: string;
  label: string;
  sourceId: string | null;
  sortOrder: number;
  options?: unknown;
  /** `custom_field_definitions.storefront_display` — its `compare` flag / order (D18). */
  storefrontDisplay?: unknown;
}

/** One printed attribute row: its label and one cell per product, in column order. */
export interface CompareRow {
  code: string;
  label: string;
  values: string[];
}

/** The Zoey attribute code a definition was imported from, or null for an authored field. */
export function zoeyCodeOf(def: Pick<CompareFieldDefinition, "sourceId">): string | null {
  const id = def.sourceId ?? "";
  return id.startsWith(SOURCE_PREFIX) ? id.slice(SOURCE_PREFIX.length) : null;
}

/**
 * The definitions the compare page prints, in order: services `comparableDefinitionsInOrder` — a
 * definition's own "Show on compare page" flag (D18) when staff set one, else today's Zoey set; the
 * flag's order, else the definition's sort order.
 */
export function comparableDefinitions(defs: readonly CompareFieldDefinition[]): CompareFieldDefinition[] {
  return comparableDefinitionsInOrder(defs);
}

/** A select field's stored value, shown by its option LABEL when the definition has one. */
function display(value: unknown, options: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => display(v, options)).filter(Boolean).join(", ");
  }
  const text = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  if (!text) return "";
  if (Array.isArray(options)) {
    for (const opt of options) {
      if (opt && typeof opt === "object" && String((opt as { value?: unknown }).value) === text) {
        const label = (opt as { label?: unknown }).label;
        if (typeof label === "string" && label.trim()) return label.trim();
      }
    }
  }
  return text;
}

/**
 * The attribute rows for these products (`fields` = each product's
 * `metafields.fields`, in column order). A row none of them carries is left
 * out; a blank cell in a kept row reads "N/A".
 */
export function buildCompareRows(
  defs: readonly CompareFieldDefinition[],
  fieldsPerProduct: ReadonlyArray<Record<string, unknown> | null | undefined>
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const def of comparableDefinitions(defs)) {
    const cells = fieldsPerProduct.map((f) => display(f?.[def.code], def.options));
    if (cells.every((c) => c === "")) continue;
    rows.push({ code: def.code, label: def.label, values: cells.map((c) => c || MISSING_VALUE) });
  }
  return rows;
}
