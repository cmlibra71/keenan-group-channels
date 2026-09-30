// Pure (no server imports) so it is unit-testable; re-exported by brand-node-branch.tsx.

/**
 * Does this brand tree place a filter rail? True when any node binds the listing's facets or uses a
 * facet master — only then does the route pay for the faceted listing. A tree without one (every
 * Chefs Depot brand page today) keeps its plain product read.
 */
export function brandTreeHasFilterRail(tree: unknown): boolean {
  const text = JSON.stringify(tree ?? null);
  return /"listing\.(facets|activeChips|hasActiveFilters|sort)|"componentKey":\s*"(facet-option|filter-chips|clear-filters|filter-controls|facet-price-slider|category-attribute-facets)"/.test(text);
}
