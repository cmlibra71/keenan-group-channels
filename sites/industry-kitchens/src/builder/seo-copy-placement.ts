import {
  collectBindingPaths,
  CATEGORY_SEO_COPY_BINDING,
  type NodeTree,
} from "@keenan/services/builder";

/**
 * The decision itself, with no I/O — the half worth testing.
 *
 * Component MASTERS are searched as well as the page tree: a node placed inside a
 * shared component is still on the page, and the instance on the page only
 * carries the component's key.
 */
export function treePlacesSeoCopy(
  nodeTree: NodeTree | null | undefined,
  components: Record<string, NodeTree> = {}
): boolean {
  if (!nodeTree?.root) return false;
  if (collectBindingPaths(nodeTree.root).has(CATEGORY_SEO_COPY_BINDING)) return true;
  for (const master of Object.values(components)) {
    if (master?.root && collectBindingPaths(master.root).has(CATEGORY_SEO_COPY_BINDING))
      return true;
  }
  return false;
}
