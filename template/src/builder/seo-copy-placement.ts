import {
  collectBindingPaths,
  walkTree,
  CATEGORY_SEO_COPY_BINDING,
  type NodeTree,
} from "@keenan/services/builder";

/**
 * Every component master REACHABLE from this tree, transitively.
 *
 * A master is only on the page if something on the page instantiates it, and a
 * master may instantiate another. Scoping to what is reachable matters because
 * the answer decides whether a whole block of approved copy prints at the foot
 * of 4,231 category pages: scanning EVERY master in the channel's library would
 * let one unused, half-finished draft component silently strip that block from
 * every category page on the site.
 */
function reachableMasterKeys(
  nodeTree: NodeTree,
  components: Record<string, NodeTree>
): string[] {
  const seen = new Set<string>();
  const queue: NodeTree[] = [nodeTree];
  while (queue.length) {
    const tree = queue.pop();
    if (!tree?.root) continue;
    walkTree(tree.root, (n) => {
      if (n.kind !== "component") return;
      const key = n.componentKey;
      if (!key || seen.has(key)) return;
      seen.add(key);
      const master = components[key];
      if (master) queue.push(master);
    });
  }
  return [...seen];
}

/**
 * The decision itself, with no I/O — the half worth testing.
 *
 * Does this Category Page Template PLACE the storefront's own approved page
 * copy? If it does, the block at the foot of the route withholds its intro, so
 * the same paragraphs can never print twice.
 *
 * Component masters count as well as the page tree — a node placed inside a
 * shared component is still on the page, and the instance carries only the
 * component's key — but ONLY the masters this tree actually reaches.
 */
export function treePlacesSeoCopy(
  nodeTree: NodeTree | null | undefined,
  components: Record<string, NodeTree> = {}
): boolean {
  if (!nodeTree?.root) return false;
  if (collectBindingPaths(nodeTree.root).has(CATEGORY_SEO_COPY_BINDING)) return true;
  for (const key of reachableMasterKeys(nodeTree, components)) {
    const master = components[key];
    if (master?.root && collectBindingPaths(master.root).has(CATEGORY_SEO_COPY_BINDING))
      return true;
  }
  return false;
}
