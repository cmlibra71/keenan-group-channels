// ============================================================================
// Product KITS — the storefront half of the Zoey grouped/bundle product types.
//
// Staff author these in the portal (card 7bmpuqei). The kind and the contents ride
// `products.metafields`, which is portal-owned (deliberately outside the Zoey ingestor's
// allowlist), so there is no new table and nothing to migrate:
//
//     metafields.product_kind = "grouped" | "bundle" | "configurable"
//     metafields.kit          = { items: [{ product_id, sku, name, quantity, group?, is_default? }],
//                                 groups?: [{ name, mode?, required? }] }
//
// GROUPED — a fixed set of products sold together for ONE price. The page lists what is in the
// kit; the kit is bought, quoted and invoiced as a single line, exactly as the portal says.
//
// BUNDLE — the same, except the rows are arranged into named CHOICE GROUPS and the customer picks
// one product from each. Steve's ruling on the card is that a modular configuration does NOT price
// live: the chosen combination goes through as a QUOTE REQUEST, so the picked options are captured
// onto the quote line rather than turned into a cart price here.
//
// GROUP RULES (IK parity, Zoey bundles — owner decision 2026-09-28). A Zoey bundle is mostly an
// always-included head unit plus OPTIONAL groups ("Storage Bin", "Accessories", "Stand" with a
// None answer, or tick boxes). `kit.groups` carries a rule per group name:
//
//     mode "included"  every row is part of the build; the shopper chooses nothing
//     mode "one"       pick one — required, or optional with a "None" answer
//     mode "many"      tick any number — at least one when required
//
// A group with NO rule is today's group: a required pick-one. So a kit authored before rules
// existed reads exactly as it always did.
//
// PER-STOREFRONT KITS (Chris 2026-09-28: Industry Kitchens only). The Zoey bundles are imported
// under their storefront's channel id — `metafields.channel_kits["<channel>"] = { product_kind,
// kit, quote_only? }` — and `readProductKit(metafields, CHANNEL_ID)` prefers that over the shared
// kit. Chefs Depot reads no key of Industry Kitchens'. `quote_only` is the rule that a bundle Zoey
// sells by quote only stays quote only here: no Add to Cart at a partial (head-unit) price.
//
// Everything below is pure and defensive — a hand-edited metafields blob must never 500 a product
// page, so anything unreadable simply reads as "not a kit".
// ============================================================================

import {
  configuredBundlePrice,
  readSelectionPrice,
  readZoeyBundlePrice,
  ZOEY_BUNDLE_PRICE_KEY,
  type ZoeyBundlePrice,
} from "@keenan/services/zoey-bundle-price";

export type KitKind = "grouped" | "bundle";

/** How a bundle group is answered (see GROUP RULES above). */
export type KitGroupMode = "included" | "one" | "many";

export interface KitItem {
  productId: number;
  sku: string | null;
  name: string;
  quantity: number;
  /** Bundle only — the choice group this row belongs to. */
  group: string | null;
  /** Bundle only — preselected inside its group. */
  isDefault: boolean;
  /** Zoey's own price for this option, ex GST (`zoey_selection_price`, the "+$731.00" beside it);
   *  null when Zoey printed none. Display only — the quote line is still priced by the team. */
  selectionPrice?: number | null;
}

export interface KitGroup {
  name: string;
  items: KitItem[];
  /** "one" for every group authored without a rule — today's required pick-one. */
  mode: KitGroupMode;
  /** Must the shopper answer it? Always true for a rule-less group; meaningless on "included". */
  required: boolean;
}

export interface ProductKit {
  kind: KitKind;
  items: KitItem[];
  /** Bundle only: the rows arranged into the choices the customer makes, in author order. */
  groups: KitGroup[];
  /** Read from this storefront's own `channel_kits` entry rather than the shared kit. */
  scoped: boolean;
  /** Quote only on this storefront (a scoped kit's `quote_only`). Never true on a shared kit. */
  quoteOnly: boolean;
  /** Zoey's price box for a scoped kit (`zoey_price`: From / To, or one price), ex GST; null for none. */
  zoeyPrice?: ZoeyBundlePrice | null;
}

/** The customer's picks: group name → the product ids chosen in it (one, several, or none). */
export type KitSelection = Record<string, number[]>;

/**
 * Zoey's fixed "Price as configured" bar carries its own quantity box and ADD TO QUOTE, but the
 * picks live in the kit native. The template's bar fires the `addBundleToQuote` action, which
 * raises this window event; the kit native answers it with ITS picks and the bar's quantity, through
 * the same add as its own button, and resolves the result for the bar's toast. IK only.
 */
export const KIT_ADD_TO_QUOTE_EVENT = "kg:kit-add-to-quote";
export interface KitAddToQuoteDetail {
  productId: number;
  quantity: number | null;
  /** Set (synchronously) by the kit native that takes the press. */
  handled: boolean;
  resolve: (result: { success?: boolean; error?: string }) => void;
}

/** The bar's quantity box value → a whole number of units, or null for "one". */
export function barQuantity(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 10000) : null;
}

/**
 * Zoey's "Price as configured" for these picks, ex GST: the From amount plus every picked OPTIONAL
 * row's own price (always-included rows are inside From). Null without a captured range.
 */
export function kitConfiguredPrice(kit: ProductKit | null | undefined, selection: KitSelection): number | null {
  if (!kit || kit.kind !== "bundle" || kit.zoeyPrice?.display !== "range") return null;
  const picked: Array<number | null> = [];
  for (const g of kit.groups) {
    if (g.mode === "included") continue;
    const ids = selection[g.name] ?? [];
    for (const item of g.items) if (ids.includes(item.productId)) picked.push(item.selectionPrice ?? null);
  }
  return configuredBundlePrice(kit.zoeyPrice.from ?? null, picked);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toPositiveInt(value: unknown, fallback: number | null = null): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function cleanLabel(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim().slice(0, max);
  return s.length > 0 ? s : null;
}

interface GroupRule {
  mode: KitGroupMode;
  required: boolean;
}

/** `kit.groups` → rule per group name. Unknown modes are ignored (the group keeps today's rule). */
function readGroupRules(kit: Record<string, unknown>): Map<string, GroupRule> {
  const rules = new Map<string, GroupRule>();
  const raw = Array.isArray(kit.groups) ? kit.groups : [];
  for (const entry of raw) {
    const r = asRecord(entry);
    const name = cleanLabel(r.name);
    const mode = r.mode === "included" || r.mode === "one" || r.mode === "many" ? r.mode : null;
    if (!name || !mode || rules.has(name)) continue;
    rules.set(name, { mode, required: mode === "included" ? true : r.required !== false });
  }
  return rules;
}

/** One kit bag (`{ product_kind?, kit }` shape) → a ProductKit, or null. */
function readKitBag(root: Record<string, unknown>, scoped: boolean): ProductKit | null {
  const kitBag = asRecord(root.kit);
  const rawItems = kitBag.items;
  if (!Array.isArray(rawItems)) return null;

  const items: KitItem[] = [];
  for (const raw of rawItems) {
    const row = asRecord(raw);
    const productId = toPositiveInt(row.product_id ?? row.productId);
    if (productId === null) continue;
    items.push({
      productId,
      sku: cleanLabel(row.sku, 100),
      name: cleanLabel(row.name, 255) ?? `Product #${productId}`,
      quantity: toPositiveInt(row.quantity, 1) ?? 1,
      group: cleanLabel(row.group),
      isDefault: row.is_default === true,
      selectionPrice: scoped ? readSelectionPrice(row) : null,
    });
  }
  if (items.length === 0) return null;

  const declared = typeof root.product_kind === "string" ? root.product_kind.trim().toLowerCase() : "";
  const kind: KitKind =
    declared === "bundle" || declared === "grouped"
      ? (declared as KitKind)
      : items.some((i) => i.group)
        ? "bundle"
        : "grouped";

  return {
    kind,
    items,
    groups: kind === "bundle" ? groupKitItems(items, readGroupRules(kitBag)) : [],
    scoped,
    quoteOnly: scoped && root.quote_only === true,
    zoeyPrice: scoped ? readZoeyBundlePrice(root[ZOEY_BUNDLE_PRICE_KEY]) : null,
  };
}

/**
 * The kit a product carries, or null when it is not a kit at all.
 *
 * `metafields` can arrive as an object or (from a jsonb column read through a driver that
 * double-encodes) as a JSON string, so both are accepted. `channelId` prefers THAT storefront's
 * own kit (`metafields.channel_kits[<channel>]`); without one — or with no scoped kit stored —
 * the shared kit is read exactly as before.
 */
export function readProductKit(metafields: unknown, channelId?: number | null): ProductKit | null {
  let source = metafields;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  const root = asRecord(source);
  if (channelId !== null && channelId !== undefined && Number.isInteger(channelId)) {
    const scoped = asRecord(asRecord(root.channel_kits)[String(channelId)]);
    const kit = readKitBag(scoped, true);
    if (kit) return kit;
  }
  return readKitBag(root, false);
}

/** Bundle rows arranged into their choice groups, in first-seen order. Ungrouped rows are dropped
 *  — the portal refuses to save them, and a choice with no name is not a choice. */
export function groupKitItems(items: KitItem[], rules: Map<string, GroupRule> = new Map()): KitGroup[] {
  const groups: KitGroup[] = [];
  for (const item of items) {
    if (!item.group) continue;
    const hit = groups.find((g) => g.name === item.group);
    if (hit) hit.items.push(item);
    else {
      const rule = rules.get(item.group) ?? { mode: "one" as const, required: true };
      groups.push({ name: item.group, items: [item], mode: rule.mode, required: rule.required });
    }
  }
  return groups;
}

/**
 * What a bundle starts on. A rule-less (or required pick-one) group: its marked default, else its
 * first product — today's behaviour. An OPTIONAL pick-one: its default, else None. A tick-box
 * group: every row marked default. An always-included group is not a choice and is not listed.
 */
export function defaultKitSelection(groups: KitGroup[]): KitSelection {
  const selection: KitSelection = {};
  for (const group of groups) {
    if (group.mode === "included") continue;
    if (group.mode === "many") {
      const ticked = group.items.filter((i) => i.isDefault).map((i) => i.productId);
      if (ticked.length > 0) selection[group.name] = ticked;
      continue;
    }
    const chosen = group.items.find((i) => i.isDefault) ?? (group.required ? group.items[0] : undefined);
    if (chosen) selection[group.name] = [chosen.productId];
  }
  return selection;
}

/**
 * The shopper picks (or un-picks) one row. Pick-one replaces; an OPTIONAL pick-one accepts
 * `productId = null` as the None answer; a tick-box group toggles. Pure — returns a new object.
 */
export function toggleKitSelection(
  kit: ProductKit,
  selection: KitSelection,
  groupName: string,
  productId: number | null
): KitSelection {
  const group = kit.groups.find((g) => g.name === groupName);
  if (!group || group.mode === "included") return selection;
  if (productId === null) {
    if (group.mode === "one" && group.required) return selection;
    return { ...selection, [groupName]: [] };
  }
  if (!group.items.some((i) => i.productId === productId)) return selection;
  if (group.mode === "one") return { ...selection, [groupName]: [productId] };
  const current = selection[groupName] ?? [];
  return {
    ...selection,
    [groupName]: current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
  };
}

/** Every group the shopper MUST answer has an answer. Grouped kits are always ready. */
export function kitSelectionReady(kit: ProductKit | null | undefined, selection: KitSelection): boolean {
  if (!kit || kit.kind !== "bundle") return true;
  return kit.groups.every(
    (g) => g.mode === "included" || !g.required || (selection[g.name] ?? []).length > 0
  );
}

export interface KitChoice {
  group: string;
  product_id: number;
}

/** The selection as it travels to the server — group names + product ids only. */
export function toKitChoices(selection: KitSelection): KitChoice[] {
  return Object.entries(selection).flatMap(([group, ids]) =>
    (Array.isArray(ids) ? ids : [ids]).map((product_id) => ({ group, product_id: Number(product_id) }))
  );
}

/**
 * The build a listing TILE (which posts no picks) sends, or null when it cannot send one.
 *
 * Only for a kit scoped to this storefront — a shared kit keeps today's refusal exactly. The build
 * is every always-included row plus each group's MARKED default; a required pick-one or tick-box
 * group with no marked default cannot be answered from a tile, so the tile is refused (null) and
 * the shopper is sent to the page.
 */
export function tileKitChoices(kit: ProductKit): KitChoice[] | null {
  if (kit.kind !== "bundle" || !kit.scoped) return null;
  const choices: KitChoice[] = [];
  for (const g of kit.groups) {
    if (g.mode === "included") continue;
    const defaults = g.items.filter((i) => i.isDefault);
    const picked = g.mode === "one" ? defaults.slice(0, 1) : defaults;
    if (g.required && picked.length === 0) return null;
    for (const i of picked) choices.push({ group: g.name, product_id: i.productId });
  }
  return choices;
}

export interface ResolvedKitChoice extends KitChoice {
  sku: string | null;
  name: string;
  quantity: number;
}

/**
 * Check a submitted selection against the product's OWN kit and resolve it to real rows.
 *
 * The client sends group names and product ids; every name, sku and quantity written to the quote
 * is re-read from the product here, so a hand-made request can never invent a line. Returns null
 * when the selection breaks a group's rule — a required group unanswered, two answers to a
 * pick-one, or a product that is not in the group. Always-included rows are resolved whatever was
 * sent (and anything sent for such a group is ignored); a skipped optional group resolves nothing.
 */
export function resolveKitChoices(
  kit: ProductKit,
  choices: KitChoice[] | null | undefined
): ResolvedKitChoice[] | null {
  if (kit.kind !== "bundle") return null;
  if (!Array.isArray(choices)) return null;
  const resolved: ResolvedKitChoice[] = [];
  const row = (group: string, item: KitItem): ResolvedKitChoice => ({
    group,
    product_id: item.productId,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
  });
  for (const group of kit.groups) {
    if (group.mode === "included") {
      for (const item of group.items) resolved.push(row(group.name, item));
      continue;
    }
    const submitted = choices.filter((c) => c && c.group === group.name);
    const ids = [...new Set(submitted.map((c) => Number(c.product_id)))];
    if (group.mode === "one" && submitted.length > 1) return null;
    if (group.required && ids.length === 0) return null;
    // Author order, whatever order the browser posted in.
    const items = group.items.filter((i) => ids.includes(i.productId));
    if (items.length !== ids.length) return null;
    for (const item of items) resolved.push(row(group.name, item));
  }
  return resolved;
}

/** The configuration in one line a sales rep can read straight off the quote. */
export function describeKitChoices(choices: ResolvedKitChoice[]): string {
  return choices
    .map((c) => `${c.group}: ${c.name}${c.sku ? ` (${c.sku})` : ""}${c.quantity > 1 ? ` ×${c.quantity}` : ""}`)
    .join("\n");
}

/** The contents of a grouped kit, for the "what's included" list and the quote line note. */
export function describeKitContents(kit: ProductKit): string {
  return kit.items
    .map((i) => `${i.quantity} × ${i.name}${i.sku ? ` (${i.sku})` : ""}`)
    .join("\n");
}
