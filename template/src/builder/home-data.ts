import type { HomeNativeData } from "./BuilderHomePage";
import type { HomeSectionsInput } from "@keenan/services/builder";

// ============================================================================
// SERVER data assembly for the node homepage — PER-SITE, deliberately empty here.
//
// What a homepage needs fetched is the most site-specific thing there is: Chefs
// Depot resolves membership, draws, brand logos and two product rails; Industry
// Kitchens resolves an ordered list of configured sections. Neither belongs to
// the other, so the reference site ships the contract and no data.
//
// A new site replaces this file with its own queries. The shared branch
// (home-node-branch.tsx) only ever calls `loadHomeNativeData(keys, needs)` and
// passes the result to the composer.
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
  /** home.sectionList[*] — a channel passing its own ordered sections through. */
  sectionList?: boolean;
}

export async function loadHomeNativeData(
  _keys: Set<string>,
  _pathNeeds: HomePathNeeds = {}
): Promise<{ home: HomeNativeData; sections: HomeSectionsInput }> {
  void _keys;
  void _pathNeeds;
  return { home: {}, sections: {} };
}
