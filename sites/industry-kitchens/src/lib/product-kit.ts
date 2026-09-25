// ============================================================================
// Product KITS — the storefront half of the Zoey grouped/bundle product types.
//
// Staff author these in the portal (card 7bmpuqei). The kind and the contents ride
// `products.metafields`, which is portal-owned (deliberately outside the Zoey ingestor's
// allowlist), so there is no new table and nothing to migrate:
//
//     metafields.product_kind = "grouped" | "bundle" | "configurable"
//     metafields.kit          = { items: [{ product_id, sku, name, quantity, group?, is_default? }],
//                                 optional_groups?: ["Accessories", …] }
//
// GROUPED — a fixed set of products sold together for ONE price. The page lists what is in the
// kit; the kit is bought, quoted and invoiced as a single line, exactly as the portal says.
//
// BUNDLE — Zoey's bundled product (card Tc5ekvD6, support.zoey.com/docs/bundled-product). The rows
// are arranged into named CHOICE GROUPS and the customer picks one product in each:
//   - a REQUIRED group starts on the author's default, else its first product, and can never be
//     left empty;
//   - an OPTIONAL group (named in `optional_groups`) starts on its default if the author marked
//     one, else on nothing, and offers "None";
//   - a required group holding ONE product is a part that is always included (Zoey's fixed
//     selection) — shown, priced, never asked.
// The price is Zoey's DYNAMIC price: the bundle's own price (usually $0) plus every chosen
// component at the price THIS shopper would pay for it on its own, which is what the cart then
// charges, because Add to Cart writes each chosen component as its own cart line (reporting keeps
// the component SKUs — the same reasoning as the promotion bundles on `sf-bundle-page`). Add to
// Quote writes the build the same way — the bundle's own line when it has a price, then one
// customer-sourced quote line per part at its catalogue price — so the quote carries the money the
// page stated. Listing tiles, search hits and rails price a bundle at the build its page opens on
// (`defaultBuildTotal`, applied in `lib/pricing/bundle-listing.ts`).
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
  /** The shopper may choose nothing here ("None"). */
  optional: boolean;
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

  const optional = new Set(
    (Array.isArray(kitBag.optional_groups) ? kitBag.optional_groups : [])
      .map((g) => cleanLabel(g))
      .filter((g): g is string => g !== null)
  );
  return { kind, items, groups: kind === "bundle" ? groupKitItems(items, optional) : [] };
}

/** Bundle rows arranged into their choice groups, in first-seen order. Ungrouped rows are dropped
 *  — the portal refuses to save them, and a choice with no name is not a choice. */
export function groupKitItems(items: KitItem[], optional: ReadonlySet<string> = new Set()): KitGroup[] {
  const groups: KitGroup[] = [];
  for (const item of items) {
    if (!item.group) continue;
    const hit = groups.find((g) => g.name === item.group);
    if (hit) hit.items.push(item);
    else groups.push({ name: item.group, items: [item], optional: optional.has(item.group) });
  }
  return groups;
}

/** A required group with one product: always included, nothing to ask. */
export function isFixedGroup(group: KitGroup): boolean {
  return !group.optional && group.items.length === 1;
}

/**
 * What a bundle starts on. A REQUIRED group: its marked default, else its first product — the
 * build on first paint is always a complete one. An OPTIONAL group: its marked default, else
 * nothing, because an optional accessory is a charge and a charge the shopper did not ask for
 * must never be in the price when the page first paints (the paid-extras rule, 0CDcCYmO).
 */
export function defaultKitSelection(groups: KitGroup[]): Record<string, number> {
  const selection: Record<string, number> = {};
  for (const group of groups) {
    const chosen = group.items.find((i) => i.isDefault) ?? (group.optional ? undefined : group.items[0]);
    if (chosen) selection[group.name] = chosen.productId;
  }
  return selection;
}

export interface KitChoice {
  group: string;
  product_id: number;
}

/** The selection as it travels to the server — group names + product ids only. An optional group
 *  answered "None" is simply absent. */
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
 * or the cart is re-read from the product here, so a hand-made request can never invent a line.
 * Returns null when the selection is not a build this bundle offers: a required group unanswered,
 * any group answered twice, a product offered in a different group (or not at all), or a group
 * the bundle does not have. An optional group may be left out — that is its "None".
 *
 * `null` choices (the caller had no picker — a listing tile) are never a build.
 */
export function resolveKitChoices(
  kit: ProductKit,
  choices: KitChoice[] | null | undefined
): ResolvedKitChoice[] | null {
  if (kit.kind !== "bundle") return null;
  if (!Array.isArray(choices)) return null;
  for (const c of choices) {
    if (!c || !kit.groups.some((g) => g.name === c.group)) return null;
  }
  const resolved: ResolvedKitChoice[] = [];
  for (const group of kit.groups) {
    const submitted = choices.filter((c) => c.group === group.name);
    if (submitted.length > 1) return null;
    if (submitted.length === 0) {
      if (group.optional) continue;
      return null;
    }
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
  return resolved;
}

/** One bundle part as it is written to a cart or a quote: a product, the total quantity of it
 *  the build needs, and the groups that asked for it. */
export interface BundlePart {
  productId: number;
  sku: string | null;
  name: string;
  quantity: number;
  groups: string[];
}

/**
 * The resolved build as the LINES it becomes — one per product, at the kit quantity times the
 * number of bundles asked for. Two groups that picked the same product are ONE line of the summed
 * quantity, so the pre-write checks (stock, pack size) test the amount that is actually written.
 */
export function bundleParts(build: ResolvedKitChoice[], bundles: number): BundlePart[] {
  const times = Math.max(1, Math.floor(Number(bundles) || 1));
  const parts: BundlePart[] = [];
  for (const c of build) {
    const hit = parts.find((p) => p.productId === c.product_id);
    if (hit) {
      hit.quantity += c.quantity * times;
      if (!hit.groups.includes(c.group)) hit.groups.push(c.group);
    } else {
      parts.push({ productId: c.product_id, sku: c.sku, name: c.name, quantity: c.quantity * times, groups: [c.group] });
    }
  }
  return parts;
}

/** The Comment a bundle part's quote line carries, so the rep and the customer can see which
 *  bundle it was chosen for. */
export function bundlePartNote(bundleName: string): string {
  const name = bundleName.replace(/\s+/g, " ").trim();
  return name ? `Part of ${name}` : "Part of a bundle";
}

/**
 * Where a refused tile add sends the shopper: the bundle's own product page, the only screen that
 * draws its pickers. A tile cannot build a bundle, and the authored Chefs Depot tile has nowhere to
 * print the refusal (`sf-catalog-browse`), so the tile button navigates instead of doing nothing.
 */
export function bundleProductPath(urlPath: string | null | undefined): string | null {
  if (typeof urlPath !== "string") return null;
  const slug = urlPath.trim().replace(/^\/+/, "").replace(/^products\//, "");
  if (!slug || slug.includes("//") || slug.includes("\\") || /^[a-z]+:/i.test(slug)) return null;
  return `/products/${slug}`;
}

/** The required groups a shopper actually CHOOSES in (two or more products) — what a refusal from
 *  a page with no picker has to name. */
export function kitQuestions(kit: ProductKit): string[] {
  return kit.groups.filter((g) => !g.optional && g.items.length > 1).map((g) => g.name);
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

// ── Money (Zoey's dynamic price) ──────────────────────────────────────────────────────────────

/**
 * What each component costs THIS shopper, ex GST, per unit — resolved server-side by the product
 * route through the cart's own pricing (`lib/product-kit-pricing.ts`). A component that is absent
 * here cannot be bought online (not sold on this storefront, outside this shopper's catalogue,
 * switched off for the cart, price hidden, or no price at all).
 */
export type KitPrices = Record<number, number>;

/**
 * The chosen components' total for ONE bundle, ex GST — what the cart will add on top of the
 * bundle's own price. Null when any chosen component has no price here: the build is then not
 * buyable online and the page says so rather than print a total that leaves a part out.
 */
export function kitBuildTotal(
  kit: ProductKit,
  selection: Record<string, number>,
  prices: KitPrices | null | undefined
): number | null {
  if (kit.kind !== "bundle") return 0;
  let total = 0;
  for (const group of kit.groups) {
    const chosenId = selection[group.name];
    if (chosenId == null) continue;
    const item = group.items.find((i) => i.productId === chosenId);
    if (!item) continue;
    const unit = prices?.[item.productId];
    if (unit == null || !Number.isFinite(unit) || unit <= 0) return null;
    total += unit * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

/**
 * The build a bundle's page OPENS on (`defaultKitSelection`), priced — the figure a listing tile,
 * a search hit or a rail adds to the bundle's own price, so the tile states exactly the headline
 * the page first paints. Null when a part of that build has no price online here: the page then
 * prints no configured price either, and the tile keeps the bundle's own price.
 */
export function defaultBuildTotal(kit: ProductKit | null, prices: KitPrices | null | undefined): number | null {
  if (!kit || kit.kind !== "bundle") return null;
  return kitBuildTotal(kit, defaultKitSelection(kit.groups), prices);
}

/** A stored money string with `add` on top, to 2dp. An unreadable value is returned untouched. */
function plus(value: string, add: number): string {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return (Math.round((n + add) * 100) / 100).toFixed(2);
}

/**
 * The product as the purchase provider should price it once a build is chosen: every amount it
 * reads (the product's price and sale price, each variant's, the member / contract price) carries
 * the build total, so the headline, the member price, the weekly finance figure and the "is this
 * product priced" test all read Zoey's configured price — and move as the shopper chooses.
 *
 * Pure and non-mutating: returns the SAME object when there is nothing to add, so a product that
 * is not a bundle costs nothing here.
 */
export function withKitPrice<
  P extends {
    price: string;
    salePrice?: string | null;
    variants?: Array<{ price?: string | null; salePrice?: string | null }>;
  },
>(product: P, add: number | null): P {
  if (add == null || add === 0) return product;
  return {
    ...product,
    price: plus(product.price || "0", add),
    salePrice: product.salePrice ? plus(product.salePrice, add) : product.salePrice,
    variants: Array.isArray(product.variants)
      ? product.variants.map((v) => ({
          ...v,
          price: v.price ? plus(v.price, add) : v.price,
          salePrice: v.salePrice ? plus(v.salePrice, add) : v.salePrice,
        }))
      : product.variants,
  };
}

/** A member / contract price with the build on top (null stays null — no member price). */
export function memberPriceWithKit(price: number | null | undefined, add: number | null): number | null {
  if (price == null) return null;
  if (add == null || add === 0) return price;
  return Math.round((price + add) * 100) / 100;
}

/** The per-variant member prices, each with the build on top. Same object when nothing is added. */
export function memberPriceMapWithKit(
  map: Record<number, number>,
  add: number | null
): Record<number, number> {
  if (add == null || add === 0) return map;
  const out: Record<number, number> = {};
  for (const [id, price] of Object.entries(map)) out[Number(id)] = memberPriceWithKit(price, add) as number;
  return out;
}
