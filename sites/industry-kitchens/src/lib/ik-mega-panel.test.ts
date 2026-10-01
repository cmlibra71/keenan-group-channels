import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IK_MEGA_MENU_SETTINGS,
  ikBalanceColumns,
  ikBarHref,
  ikIsHighlighted,
  ikPanelGroups,
  readIkMegaMenuSettings,
  ikSplitNavItems,
} from "./ik-mega-panel";
import { flattenTree, panelColumns, type MegaMenuNodeLike, type MegaNavItem } from "./mega-menu";
import { ikNavItems } from "./ik-nav";

const node = (id: number, name: string, children: MegaMenuNodeLike[] = []): MegaMenuNodeLike => ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), children });
// Business Type (238) with two columns; Bakery (426) has 9 sub-categories.
const bakery = node(426, "Bakery Equipment", Array.from({ length: 9 }, (_, i) => node(1000 + i, `Bake ${i}`)));
const kebab = node(427, "Kebab Shop", [node(2000, "Grills")]);
const biz = node(238, "Business Type", [bakery, kebab]);
const byId = flattenTree([biz]);

test("settings: unset keeps today's behaviour; null limit = all; launcher can be switched off", () => {
  assert.deepEqual(readIkMegaMenuSettings(undefined), DEFAULT_IK_MEGA_MENU_SETTINGS);
  assert.deepEqual(readIkMegaMenuSettings({ column_link_limit: "x", all_categories_launcher: "no" }), DEFAULT_IK_MEGA_MENU_SETTINGS);
  assert.deepEqual(readIkMegaMenuSettings({ column_link_limit: null, all_categories_launcher: false }), { columnLinkLimit: null, allCategoriesLauncher: false });
  assert.equal(readIkMegaMenuSettings({ column_link_limit: 0 }).columnLinkLimit, 7);
});

test("no editor extras: the same columns, links and View all as before (7 per heading)", () => {
  const { groups, extras } = ikPanelGroups(biz, { type: "category", label: "Business Type", categoryId: 238 }, byId);
  assert.deepEqual(extras, []);
  assert.deepEqual(groups.map((g) => [g.label, g.links.length, g.moreHref ?? null]), [
    ["Bakery Equipment", 7, "/categories/bakery-equipment"],
    ["Kebab Shop", 1, null],
  ]);
  // Balanced exactly like the shared panelColumns.
  const mine = ikBalanceColumns(groups, 3).map((c) => c.map((g) => g.label));
  const theirs = panelColumns(biz.children, 3).map((c) => c.map((g) => g.name));
  assert.deepEqual(mine, theirs);
});

test("Zoey in-column menu links: a category extra matching a column appends its children there; a link extra with children is its own column; the rest stay info links", () => {
  const item: MegaNavItem = {
    type: "category",
    label: "Business Type",
    categoryId: 238,
    children: [
      { type: "category", label: "Kebab Shop", categoryId: 427, children: [{ type: "link", label: "Doner Knives", url: "/categories/doner-knives" }] },
      { type: "link", label: "Guides", url: "/pages/guides", children: [{ type: "link", label: "Cafe guide", url: "/pages/cafe", newTab: true }] },
      { type: "page", label: "Delivery", pageSlug: "delivery" },
      { type: "link", label: "Coffee Machines >", url: "/categories/commercial-coffee-machines" },
      { type: "category", label: "Kebab dup", categoryId: 427 }, // no children: nothing doubled
    ],
  };
  const { groups, extras } = ikPanelGroups(biz, item, byId, { columnLinkLimit: null, allCategoriesLauncher: true });
  // Editor order first (Kebab Shop it names, Guides, Coffee Machines), then unnamed columns (Bakery).
  assert.deepEqual(groups.map((g) => g.label), ["Kebab Shop", "Guides", "Coffee Machines >", "Bakery Equipment"]);
  assert.deepEqual(groups[2].links, []);
  assert.equal(groups[2].href, "/categories/commercial-coffee-machines");
  // The editor's listed link first, then the unlisted sub-category.
  assert.deepEqual(groups[0].links.map((l) => [l.label, l.href]), [["Doner Knives", "/categories/doner-knives"], ["Grills", "/categories/grills"]]);
  assert.equal(groups[3].links.length, 9); // limit null = all
  assert.deepEqual(groups[1].links.map((l) => [l.label, l.newTab ?? false]), [["Cafe guide", true]]);
  assert.deepEqual(extras.map((e) => e.label), ["Delivery"]);
});

test("bar link: a department item's own address wins (Brands -> /brands), else its category page", () => {
  const brands = node(223, "Brands", [node(500, "Hallde")]);
  const map = flattenTree([brands]);
  assert.equal(ikBarHref({ type: "category", label: "Brands", categoryId: 223, url: "/brands" }, map), "/brands");
  assert.equal(ikBarHref({ type: "category", label: "Brands", categoryId: 223 }, map), "/categories/brands");
  assert.equal(ikBarHref({ type: "link", label: "Finance", url: "/pages/flexi-commercial" }, map), "/pages/flexi-commercial");
});

test("highlight: the editor's flag anywhere; unset keeps the old rule (Clearance link in the right slot)", () => {
  assert.equal(ikIsHighlighted({ type: "category", label: "Clearance Sale", highlight: true }, "/clearance", false), true);
  assert.equal(ikIsHighlighted({ type: "link", label: "Clearance Sale", highlight: false }, "/clearance", true), false);
  assert.equal(ikIsHighlighted({ type: "link", label: "Clearance Sale" }, "/clearance", true), true);
  assert.equal(ikIsHighlighted({ type: "link", label: "Clearance Sale" }, "/clearance", false), false);
  assert.equal(ikIsHighlighted({ type: "link", label: "Finance" }, "/pages/flexi-commercial", true), false);
});

test("All Categories launcher: on by default, off when the setting says so", () => {
  const items: MegaNavItem[] = [{ type: "category", label: "Business Type", categoryId: 238 }];
  assert.equal(ikNavItems({ departments: [biz], items })[0].type, "categories");
  assert.deepEqual(ikNavItems({ departments: [biz], items, allCategoriesLauncher: false }).map((i) => i.label), ["Business Type"]);
});

test("link order inside a column: the editor's listed entries in its order, then unlisted sub-categories", () => {
  const item: MegaNavItem = {
    type: "category", label: "Business Type", categoryId: 238,
    children: [{ type: "category", label: "Bakery Equipment", categoryId: 426, children: [
      { type: "link", label: "Speed Ovens", url: "/categories/speed-ovens" },
      { type: "category", label: "Bake 3", categoryId: 1003 },
      { type: "category", label: "Bake 3 again", categoryId: 1003 }, // no double
      { type: "category", label: "Elsewhere", categoryId: 2000 }, // not this column's: a link to its page
    ] }],
  };
  const { groups } = ikPanelGroups(biz, item, byId, { columnLinkLimit: null, allCategoriesLauncher: true });
  const bakeryGroup = groups.find((g) => g.label === "Bakery Equipment")!;
  assert.deepEqual(bakeryGroup.links.slice(0, 4).map((l) => l.label), ["Speed Ovens", "Bake 3", "Elsewhere", "Bake 0"]);
  assert.equal(bakeryGroup.links[2].href, "/categories/grills");
  assert.equal(bakeryGroup.links.length, 11); // 9 sub-categories (one listed) + 2 editor links
});

test("ordered layout: the editor's columns fill top to bottom in order, balanced", () => {
  const g = (label: string, total: number) => ({ key: label, label, href: "#", links: [], total });
  const groups = Array.from({ length: 9 }, (_, i) => g(`B${i}`, 0));
  const cols = ikBalanceColumns(groups, 3, true);
  assert.deepEqual(cols.map((c) => c.map((x) => x.label)), [["B0", "B1", "B2"], ["B3", "B4", "B5"], ["B6", "B7", "B8"]]);
  // Reading down then across keeps the order whatever the weights.
  const mixed = [g("a", 10), g("b", 0), g("c", 0), g("d", 10), g("e", 0)];
  assert.deepEqual(ikBalanceColumns(mixed, 3, true).flat().map((x) => x.label), ["a", "b", "c", "d", "e"]);
  // Not ordered: the legacy greedy layout.
  assert.deepEqual(ikBalanceColumns(groups, 3, false).map((c) => c.map((x) => x.label)), [["B0", "B3", "B6"], ["B1", "B4", "B7"], ["B2", "B5", "B8"]]);
});

test("bar split: a highlighted item with a drop-down stays in the right slot; other drop-downs stay left", () => {
  const items: MegaNavItem[] = [
    { type: "category", label: "Business Type", categoryId: 238 },
    { type: "link", label: "Brands", url: "/brands", children: [{ type: "link", label: "Hallde", url: "/brands/hallde" }] },
    { type: "link", label: "Clearance Sale", url: "/clearance", highlight: true, children: [{ type: "link", label: "Special Offer", url: "/clearance?type=new" }] },
    { type: "link", label: "Finance", url: "/pages/flexi-commercial" },
  ];
  const { left, right } = ikSplitNavItems(items);
  assert.deepEqual(left.map((i) => i.label), ["Business Type", "Brands"]);
  assert.deepEqual(right.map((i) => i.label), ["Clearance Sale", "Finance"]);
  // Unhighlighted drop-down: left, as the shared rule.
  const plain = items.map((i) => (i.label === "Clearance Sale" ? { ...i, highlight: undefined } : i));
  assert.deepEqual(ikSplitNavItems(plain).right.map((i) => i.label), ["Finance"]);
});
