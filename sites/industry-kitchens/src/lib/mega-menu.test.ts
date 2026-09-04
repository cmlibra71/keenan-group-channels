import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptDepartmentLinks,
  flattenTree,
  itemHref,
  panelColumns,
  panelExtras,
  resolveNavItems,
  shortNavLabel,
  splitNavItems,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "./mega-menu.ts";

const dept = (id: number, name: string, children: MegaMenuNodeLike[] = []): MegaMenuNodeLike => ({
  id,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  image_url: null,
  children,
});

const departments = [
  dept(1, "Cooking Equipment", [dept(11, "Ovens", [dept(111, "Combi Ovens")])]),
  dept(2, "Refrigeration & Ice"),
  dept(3, "Food Preparation"),
];

test("with no editor items every department is on the bar", () => {
  const items = resolveNavItems({ departments });
  assert.deepEqual(
    items.map((i) => i.label),
    ["All Departments", "Cooking Equipment", "Refrigeration & Ice", "Food Preparation", "Clearance"]
  );
  assert.equal(items[0].type, "categories");
  assert.equal(items[4].url, "/clearance");
});

test("a department switched off leaves the default bar", () => {
  const items = resolveNavItems({ departments, hiddenCategoryIds: [2] });
  assert.deepEqual(
    items.map((i) => i.label),
    ["All Departments", "Cooking Equipment", "Food Preparation", "Clearance"]
  );
});

test("a department switched off leaves a CONFIGURED bar too", () => {
  const configured: MegaNavItem[] = [
    { type: "categories", label: "All Departments" },
    { type: "category", label: "Cooking", categoryId: 1 },
    { type: "category", label: "Fridges", categoryId: 2 },
    { type: "category", label: "Food Prep", categoryId: 3 },
    { type: "link", label: "Clearance", url: "/clearance" },
  ];
  const items = resolveNavItems({ departments, items: configured, hiddenCategoryIds: [2] });
  assert.deepEqual(
    items.map((i) => i.label),
    ["All Departments", "Cooking", "Food Prep", "Clearance"]
  );
});

test("a department the editor never mentions is added automatically, before the trailing links", () => {
  const configured: MegaNavItem[] = [
    { type: "categories", label: "All Departments" },
    { type: "category", label: "Cooking", categoryId: 1 },
    { type: "link", label: "Clearance", url: "/clearance" },
  ];
  const items = resolveNavItems({ departments, items: configured });
  assert.deepEqual(
    items.map((i) => i.label),
    ["All Departments", "Cooking", "Refrigeration & Ice", "Food Preparation", "Clearance"]
  );
  // The editor's own wording and order survive; only the missing ones are auto.
  assert.equal(items[1].auto, undefined);
  assert.equal(items[2].auto, true);
});

test("with no department items at all the new ones land after All Departments", () => {
  const configured: MegaNavItem[] = [
    { type: "categories", label: "All Departments" },
    { type: "page", label: "About us", pageSlug: "about-us" },
  ];
  const items = resolveNavItems({ departments, items: configured });
  assert.deepEqual(
    items.map((i) => i.label),
    ["All Departments", "Cooking Equipment", "Refrigeration & Ice", "Food Preparation", "About us"]
  );
});

test("an all-links bar keeps its links and still gains the departments", () => {
  const configured: MegaNavItem[] = [
    { type: "link", label: "Finance", url: "/pages/finance" },
    { type: "link", label: "Contact", url: "/pages/contact" },
  ];
  const items = resolveNavItems({ departments, items: configured });
  assert.deepEqual(
    items.map((i) => i.label),
    ["Cooking Equipment", "Refrigeration & Ice", "Food Preparation", "Finance", "Contact"]
  );
});

test("a category item pointing at a department that no longer exists is left to the renderer", () => {
  const configured: MegaNavItem[] = [{ type: "category", label: "Gone", categoryId: 99 }];
  const items = resolveNavItems({ departments, items: configured });
  assert.equal(items[0].categoryId, 99);
  assert.equal(items.length, 4);
});

test("the trailing plain links sit in the right-hand slot", () => {
  const { left, right } = splitNavItems(resolveNavItems({ departments }));
  assert.deepEqual(right.map((i) => i.label), ["Clearance"]);
  assert.equal(left.length, 4);
});

test("an item with a drop-down never moves to the right-hand slot", () => {
  const configured: MegaNavItem[] = [
    { type: "category", label: "Cooking", categoryId: 1 },
    {
      type: "link",
      label: "Information",
      url: "/pages/about-us",
      children: [{ type: "page", label: "About us", pageSlug: "about-us" }],
    },
  ];
  const { left, right } = splitNavItems(configured);
  assert.equal(right.length, 0);
  assert.equal(left.length, 2);
});

test("hrefs resolve for every item type", () => {
  const byId = flattenTree(departments);
  assert.equal(itemHref({ type: "categories", label: "" }, byId), "/categories");
  assert.equal(
    itemHref({ type: "category", label: "", categoryId: 1 }, byId),
    "/categories/cooking-equipment"
  );
  assert.equal(itemHref({ type: "category", label: "", categoryId: 111 }, byId), "/categories/combi-ovens");
  assert.equal(itemHref({ type: "page", label: "", pageSlug: "about-us" }, byId), "/pages/about-us");
  assert.equal(itemHref({ type: "blog", label: "" }, byId), "/blog");
  assert.equal(itemHref({ type: "link", label: "", url: "/clearance" }, byId), "/clearance");
  assert.equal(itemHref({ type: "link", label: "" }, byId), "#");
});

test("bar labels are shortened", () => {
  assert.equal(shortNavLabel("Cooking Equipment"), "Cooking");
  assert.equal(shortNavLabel("Food Preparation"), "Food Prep");
  assert.equal(shortNavLabel("Cleaning & Chemicals"), "Cleaning");
  assert.equal(shortNavLabel("Smallwares"), "Smallwares");
});

test("panel columns balance the groups", () => {
  const groups = [
    dept(1, "A", [dept(11, "a1"), dept(12, "a2"), dept(13, "a3")]),
    dept(2, "B"),
    dept(3, "C"),
    dept(4, "D"),
  ];
  const columns = panelColumns(groups);
  assert.equal(columns.length, 3);
  assert.deepEqual(columns.flat().map((g) => g.id).sort(), [1, 2, 3, 4]);
  assert.deepEqual(columns[0].map((g) => g.name), ["A"]);
});

test("extra pages tucked in a department are the panel's extras", () => {
  const item: MegaNavItem = {
    type: "category",
    label: "Cooking",
    categoryId: 1,
    children: [
      { type: "page", label: "Buying guide", pageSlug: "buying-guide" },
      { type: "link", label: "", url: "/nowhere" },
    ],
  };
  assert.deepEqual(panelExtras(item).map((c) => c.label), ["Buying guide"]);
  assert.deepEqual(panelExtras({ type: "category", label: "x" }), []);
});

// ── A saved LINK to a department IS that department (card mOTgYEvX) ─────────
// Industry Kitchens' saved header is ten `type: "link"` rows carrying hardcoded
// /categories/... addresses, seeded from the old flat `header_nav` list.

test("a link to /categories/<slug> resolves to that department", () => {
  const items: MegaNavItem[] = [
    { type: "link", label: "Cooking", url: "/categories/cooking-equipment" },
    { type: "link", label: "Clearance Sale", url: "/clearance" },
  ];
  const bar = resolveNavItems({ departments, items });
  assert.equal(bar[0].type, "category");
  assert.equal(bar[0].categoryId, 1);
  assert.equal(bar[0].label, "Cooking"); // the editor's own wording survives
  assert.equal(bar[0].url, undefined);
  // The other two departments are still added automatically, after the one the
  // editor named; /clearance stays the plain link it is and falls to the right.
  assert.deepEqual(
    bar.map((i) => i.label),
    ["Cooking", "Refrigeration & Ice", "Food Preparation", "Clearance Sale"]
  );
  assert.equal(bar[3].type, "link");
  assert.deepEqual(splitNavItems(bar).right.map((i) => i.label), ["Clearance Sale"]);
});

test("a link to a department switched OFF drops off the bar", () => {
  const items: MegaNavItem[] = [
    { type: "link", label: "Fridges", url: "/categories/refrigeration-ice" },
    { type: "link", label: "Cooking", url: "/categories/cooking-equipment" },
  ];
  const bar = resolveNavItems({ departments, items, hiddenCategoryIds: [2] });
  assert.deepEqual(
    bar.map((i) => i.label),
    ["Cooking", "Food Preparation"]
  );
});

test("a department link is not duplicated by the automatic pass", () => {
  const items: MegaNavItem[] = [
    { type: "link", label: "Cooking Equipment", url: "/categories/cooking-equipment/" },
  ];
  const bar = resolveNavItems({ departments, items });
  assert.equal(bar.filter((i) => i.categoryId === 1).length, 1);
});

test("only an exact /categories/<slug> address is adopted", () => {
  const items: MegaNavItem[] = [
    { type: "link", label: "Brands", url: "/brands" },
    { type: "link", label: "All", url: "/categories" },
    { type: "link", label: "Deep", url: "/categories/cooking-equipment/ovens" },
    { type: "link", label: "Unknown", url: "/categories/not-a-department" },
    { type: "page", label: "Finance", pageSlug: "finance" },
  ];
  const bar = adoptDepartmentLinks(items, departments);
  assert.deepEqual(bar.map((i) => i.type), ["link", "link", "link", "link", "page"]);
});

test("a department link keeps working through itemHref", () => {
  const bar = resolveNavItems({
    departments,
    items: [{ type: "link", label: "Cooking", url: "/categories/cooking-equipment" }],
  });
  assert.equal(itemHref(bar[0], flattenTree(departments)), "/categories/cooking-equipment");
});

// The off switch is the ONLY thing that keeps a department off the bar. A
// department whose NAME is already on the bar as somebody's custom link is
// still added, because the portal's Mega menu tab lists it with a live switch
// and counts it as in the menu — suppressing it in code would make that switch
// inert and that count wrong (card mOTgYEvX).
test("a department is still added when a custom link carries the same word", () => {
  const items: MegaNavItem[] = [
    { type: "categories", label: "All Departments" },
    { type: "link", label: "Refrigeration & Ice", url: "/refrigeration" },
  ];
  const bar = resolveNavItems({ departments, items });
  assert.deepEqual(
    bar.map((i) => i.label),
    [
      "All Departments",
      "Cooking Equipment",
      "Refrigeration & Ice",
      "Food Preparation",
      "Refrigeration & Ice",
    ]
  );
  // ...and switching that department off is what removes it, exactly as the
  // portal screen promises.
  assert.deepEqual(
    resolveNavItems({ departments, items, hiddenCategoryIds: [2] }).map((i) => i.label),
    ["All Departments", "Cooking Equipment", "Food Preparation", "Refrigeration & Ice"]
  );
});
