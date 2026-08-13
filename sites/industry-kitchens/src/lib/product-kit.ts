// ============================================================================
// Product KITS — the storefront half of the Zoey grouped/bundle product types.
//
// Staff author these in the portal (card 7bmpuqei). The kind and the contents ride
// `products.metafields`, which is portal-owned (deliberately outside the Zoey ingestor's
// allowlist), so there is no new table and nothing to migrate:
//
//     metafields.product_kind = "grouped" | "bundle" | "configurable"
//     metafields.kit          = { items: [{ product_id, sku, name, quantity, group?, is_default? }] }
//
// GROUPED — a fixed set of products sold together for ONE price. The page lists what is in the
// kit; the kit is bought, quoted and invoiced as a single line, exactly as the portal says.
//
// BUNDLE — the same, except the rows are arranged into named CHOICE GROUPS and the customer picks
// one product from each. Steve's ruling on the card is that a modular configuration does NOT price
// live: the chosen combination goes through as a QUOTE REQUEST, so the picked options are captured
// onto the quote line rather than turned into a cart price here.
//
// Everything below is pure and defensive — a hand-edited metafields blob must never 500 a product
// page, so anything unreadable simply reads as "not a kit".
// ============================================================================

export type KitKind = "grouped" | "bundle";

export interface KitItem {
  productId: number;
  sku: string | null;
  name: string;
  quantity: number;
  /** Bundle only — the choice group this row belongs to. */
  group: string | null;
  /** Bundle only — preselected inside its group. */
  isDefault: boolean;
}

export interface KitGroup {
  name: string;
  items: KitItem[];
}

export interface ProductKit {
  kind: KitKind;
  items: KitItem[];
  /** Bundle only: the rows arranged into the choices the customer makes, in author order. */
  groups: KitGroup[];
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

/**
 * The kit a product carries, or null when it is not a kit at all.
 *
 * `metafields` can arrive as an object or (from a jsonb column read through a driver that
 * double-encodes) as a JSON string, so both are accepted.
 */
export function readProductKit(metafields: unknown): ProductKit | null {
  let source = metafields;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  const root = asRecord(source);
  const items = readKitItems(asRecord(root.kit).items);
  if (items === null) return null;

  const declared = typeof root.product_kind === "string" ? root.product_kind.trim().toLowerCase() : "";
  const kind: KitKind =
    declared === "bundle" || declared === "grouped"
      ? (declared as KitKind)
      : items.some((i) => i.group)
        ? "bundle"
        : "grouped";

  return buildKit(kind, items);
}

/**
 * The same kit when it arrives ALREADY PARSED.
 *
 * The product routes read the kit server-side and hand the parsed `ProductKit` to the sealed
 * Site-Builder leaf through `nativeData` — that object has no `kit` wrapper and no snake_case
 * rows, so `readProductKit` correctly rejects it and the leaf used to render nothing at all on the
 * only path that reaches customers. Validated rather than trusted (it crosses the server/client
 * boundary as plain JSON) and re-grouped from its own items, so a hand-assembled object cannot
 * arrive carrying choice groups its rows do not support.
 */
export function asProductKit(value: unknown): ProductKit | null {
  const root = asRecord(value);
  const declared = typeof root.kind === "string" ? root.kind.trim().toLowerCase() : "";
  if (declared !== "bundle" && declared !== "grouped") return null;
  const items = readKitItems(root.items);
  if (items === null) return null;
  return buildKit(declared as KitKind, items);
}

/** Kit rows read out of either shape (`product_id` from jsonb, `productId` from a parsed kit).
 *  Null — not an empty array — when there is nothing usable, so "not a kit" stays one test. */
function readKitItems(rawItems: unknown): KitItem[] | null {
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
      group: cleanLabel(row.group ?? row.groupName),
      isDefault: row.is_default === true || row.isDefault === true,
    });
  }
  return items.length > 0 ? items : null;
}

/**
 * A kit from its rows. A "bundle" whose rows carry no choice group at all has nothing for the
 * customer to choose, so it reads as GROUPED rather than as a bundle with zero groups — otherwise
 * it would offer an empty picker and accept an empty configuration as a valid build.
 */
function buildKit(kind: KitKind, items: KitItem[]): ProductKit {
  const groups = kind === "bundle" ? groupKitItems(items) : [];
  return groups.length === 0
    ? { kind: "grouped", items, groups: [] }
    : { kind, items, groups };
}

/** Bundle rows arranged into their choice groups, in first-seen order. Ungrouped rows are dropped
 *  — the portal refuses to save them, and a choice with no name is not a choice. */
export function groupKitItems(items: KitItem[]): KitGroup[] {
  const groups: KitGroup[] = [];
  for (const item of items) {
    if (!item.group) continue;
    const hit = groups.find((g) => g.name === item.group);
    if (hit) hit.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
}

/** What a bundle starts on: each group's marked default, else its first product. */
export function defaultKitSelection(groups: KitGroup[]): Record<string, number> {
  const selection: Record<string, number> = {};
  for (const group of groups) {
    const chosen = group.items.find((i) => i.isDefault) ?? group.items[0];
    if (chosen) selection[group.name] = chosen.productId;
  }
  return selection;
}

export interface KitChoice {
  group: string;
  product_id: number;
}

/** The selection as it travels to the server — group names + product ids only. */
export function toKitChoices(selection: Record<string, number>): KitChoice[] {
  return Object.entries(selection).map(([group, product_id]) => ({ group, product_id }));
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
 * when the selection doesn't answer every group exactly once — a half-answered configuration is
 * not a quote request, it is a mistake.
 */
export function resolveKitChoices(
  kit: ProductKit,
  choices: KitChoice[] | null | undefined
): ResolvedKitChoice[] | null {
  if (kit.kind !== "bundle") return null;
  if (!Array.isArray(choices)) return null;
  const resolved: ResolvedKitChoice[] = [];
  for (const group of kit.groups) {
    const submitted = choices.filter((c) => c && c.group === group.name);
    if (submitted.length !== 1) return null;
    const item = group.items.find((i) => i.productId === Number(submitted[0].product_id));
    if (!item) return null;
    resolved.push({
      group: group.name,
      product_id: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
    });
  }
  return resolved.length === kit.groups.length ? resolved : null;
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
