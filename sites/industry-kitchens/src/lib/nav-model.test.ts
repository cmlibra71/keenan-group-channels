import test from "node:test";
import assert from "node:assert/strict";
import type { MegaMenuNodeLike, MegaNavItem } from "./mega-menu.ts";
import { DEFAULT_IK_MEGA_MENU_SETTINGS, ikPanelGroups } from "./ik-mega-panel.ts";
import {
  drawerRowHeads,
  drawerRows,
  findNavItem,
  navItemKey,
  navModel,
  slimDepartments,
  slimNavItems,
  type NavData,
} from "./nav-model.ts";

let next = 1;
const node = (name: string, children: MegaMenuNodeLike[] = []): MegaMenuNodeLike => ({
  id: next++,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  image_url: `https://img/${name}.jpg`,
  children,
});

// dept → column → link → deeper (depth 3) → deeper still (depth 4)
const deepest = node("Deepest");
const deep = node("Deep", [deepest]);
const otherDeep = node("Other Deep");
const leaf = node("Leaf", [deep, otherDeep]);
const column = node("Column", [leaf, node("Leaf Two")]);
const dept = node("Dept", [column, node("Column Two")]);
const dept2 = node("Dept Two", [node("Solo Column")]);
const departments = [dept, dept2];

const items: MegaNavItem[] = [
  { type: "categories", label: "All", newTab: false, children: [] },
  {
    type: "category",
    label: "Dept",
    categoryId: dept.id,
    newTab: false,
    children: [
      { type: "page", label: "Guide", pageSlug: "guide", newTab: true, children: [] },
      { type: "category", label: "Deepest link", categoryId: deepest.id, newTab: false, children: [] },
    ],
  },
  { type: "link", label: "Clearance", url: "/clearance", newTab: false, children: [] },
];

const full: NavData = {
  departments,
  featured: {},
  items,
  hiddenCategoryIds: [],
  brandColumns: {},
  settings: DEFAULT_IK_MEGA_MENU_SETTINGS,
};
const slim: NavData = { ...full, departments: slimDepartments(departments, items), items: slimNavItems(items) };

test("slimDepartments keeps three levels, plus any deeper category an editor item names", () => {
  const byId = navModel(slim).byId;
  for (const n of [dept, column, leaf, dept2, deepest, deep]) assert.ok(byId.has(n.id), n.name);
  assert.equal(byId.has(otherDeep.id), false, "an unnamed depth-3 category is dropped");
});

test("slimDepartments keeps an image only on a department or a named category", () => {
  const byId = navModel(slim).byId;
  assert.equal(byId.get(dept.id)!.image_url, dept.image_url);
  assert.equal(byId.get(deepest.id)!.image_url, deepest.image_url);
  assert.equal(byId.get(column.id)!.image_url, undefined);
  assert.equal(byId.get(leaf.id)!.image_url, undefined);
});

test("slimNavItems drops only default-valued fields", () => {
  const [all, d] = slimNavItems(items);
  assert.deepEqual(all, { type: "categories", label: "All" });
  assert.equal(d.children![0].newTab, true);
  assert.equal("newTab" in d.children![1], false);
  assert.equal("children" in d.children![1], false);
});

// What a reader sees: a falsy newTab or an empty children list renders the same as none.
const seen = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (k, x) =>
      (k === "newTab" && !x) || (k === "children" && Array.isArray(x) && x.length === 0) ? undefined : x
    )
  );

test("the slimmed data draws the same bar, panels and drawer as the full data", () => {
  const a = navModel(full);
  const b = navModel(slim);
  assert.deepEqual(b.left.map(navItemKey), a.left.map(navItemKey));
  assert.deepEqual(b.right.map(navItemKey), a.right.map(navItemKey));
  assert.deepEqual(seen(drawerRows(b)), seen(drawerRows(a)));
  for (const item of a.left) {
    if (item.type !== "category") continue;
    const [da, db] = [a.byId.get(item.categoryId!)!, b.byId.get(item.categoryId!)!];
    assert.deepEqual(
      seen(ikPanelGroups(db, findNavItem(b.left, a.left.indexOf(item), navItemKey(item))!, b.byId)),
      seen(ikPanelGroups(da, item, a.byId))
    );
  }
});

test("drawerRowHeads ships the rows without their lists", () => {
  const heads = drawerRowHeads(navModel(slim));
  const rows = drawerRows(navModel(slim));
  assert.equal(heads.length, rows.length);
  heads.forEach((h, i) => {
    assert.equal("children" in h, false);
    assert.equal(h.hasChildren, rows[i].children.length > 0);
    assert.equal(h.key, rows[i].key);
  });
});

test("findNavItem confirms the position by key and falls back to a search", () => {
  const { left } = navModel(slim);
  const key = navItemKey(left[1]);
  assert.equal(findNavItem(left, 1, key), left[1]);
  assert.equal(findNavItem(left, 0, key), left[1], "moved: found by key");
  assert.equal(findNavItem(left, 1, "gone"), undefined, "removed: nothing, never the wrong item");
});
