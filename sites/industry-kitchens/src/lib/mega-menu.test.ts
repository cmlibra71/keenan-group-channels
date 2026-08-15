import test from "node:test";
import assert from "node:assert/strict";
import {
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
