import {
  getHomepageSections,
  getHomepageCategoryTiles,
  getValueBarItems,
  getCustomerLogos,
  getHomepageCopy,
} from "@/lib/store";
import type { HomeNativeData } from "./BuilderHomePage";
import type { HomeSectionsInput } from "@keenan/services/builder";

// ============================================================================
// SERVER data assembly for Industry Kitchens' node homepage.
//
// IK's homepage is an ORDERED LIST of configured sections (`homepage_sections`
// in channel settings), not the fixed slot set Chefs Depot has. So almost
// everything travels through `sectionList` — the authored tree binds
// `home.sectionList[N].*` — and only the two sections whose content lives in
// their own settings keys are resolved into the list here.
//
// This mirrors what `HomeSections.tsx` does at render time today, which is the
// point: the node tree must produce the same page from the same data.
// ============================================================================

export interface HomePathNeeds {
  hero?: boolean;
  cats?: boolean;
  brands?: boolean;
  featured?: boolean;
  clearance?: boolean;
  faq?: boolean;
  membership?: boolean;
  prize?: boolean;
  stats?: boolean;
  plan?: boolean;
  /** home.sectionList[*] — IK's ordered sections. This is the one that matters here. */
  sectionList?: boolean;
}

type Row = Record<string, unknown>;

export async function loadHomeNativeData(
  keys: Set<string>,
  pathNeeds: HomePathNeeds = {}
): Promise<{ home: HomeNativeData; sections: HomeSectionsInput }> {
  // Any authored home tree needs the section list; the key scan is kept so a
  // sealed native placed by key pulls its data too, exactly as on CD.
  const needSections = keys.size > 0 || !!pathNeeds.sectionList || !!pathNeeds.cats;
  if (!needSections) return { home: {}, sections: {} };

  const sections = await getHomepageSections().catch(() => []);

  // `category_tiles`, `value_bar` and `customer_logos` carry no content inline —
  // HomeSections.tsx fetches theirs from separate settings keys. Resolve them
  // into the list so a bound tree sees the same rows the live page renders.
  const needsTiles = sections.some((s) => s.type === "category_tiles");
  const needsValueBar = sections.some((s) => s.type === "value_bar");
  const needsLogos = sections.some((s) => s.type === "customer_logos");

  const [tiles, valueBarItems, customerLogos, copy] = await Promise.all([
    needsTiles ? getHomepageCategoryTiles().catch(() => []) : Promise.resolve([]),
    needsValueBar ? getValueBarItems().catch(() => []) : Promise.resolve([]),
    needsLogos ? getCustomerLogos().catch(() => []) : Promise.resolve([]),
    needsTiles ? getHomepageCopy().catch(() => ({})) : Promise.resolve({}),
  ]);

  const sectionList: Row[] = sections.map((s) => {
    const base = { ...(s as unknown as Row) };
    switch (s.type) {
      case "category_tiles":
        return {
          ...base,
          tiles,
          heading: (copy as Row).categories_heading ?? "",
        };
      case "value_bar":
        return { ...base, items: valueBarItems };
      case "customer_logos":
        return { ...base, logos: customerLogos };
      default:
        return base;
    }
  });

  return {
    // No sealed section natives on IK — its sections are authored nodes, so the
    // native data bag stays empty. It exists because the engine wrapper passes
    // one through; see home-natives.tsx.
    home: {},
    sections: { sectionList },
  };
}
