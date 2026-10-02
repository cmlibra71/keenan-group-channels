// ============================================================================
// Only the component masters a page can actually draw.
//
// Every node page used to hand the browser the channel's WHOLE component
// library — 24 masters, ~95 KB of the RSC payload — whatever it placed. A Chefs
// Depot product page draws 21 of them (~42 KB) and a category page 11 (~38 KB);
// the filter rail, enquiry form, draw spotlight and the rest rode along unused
// (measured live 2026-10-01).
//
// A master is reachable only through a `{ kind: "component", componentKey }`
// node, and a componentKey is always a static string, so the set a page can
// draw is exactly the closure of the keys its tree places, following each
// master into the masters IT places. The scan is deliberately coarse — it
// looks at every object anywhere in a tree, not just at known child fields — so
// a node shape added later can only make it keep MORE, never drop one in use.
// ============================================================================

function collectKeys(value: unknown, out: Set<string>): void {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (const item of v) if (item && typeof item === "object") stack.push(item);
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.kind === "component" && typeof o.componentKey === "string") out.add(o.componentKey);
      for (const item of Object.values(o)) if (item && typeof item === "object") stack.push(item);
    }
  }
}

/**
 * The subset of `components` that `tree` can render, transitively. Same values,
 * same objects — only unreachable masters are left out, so rendering is unchanged.
 */
export function usedComponents<C extends Record<string, unknown>>(tree: unknown, components: C): C {
  const used = new Set<string>();
  const pending = new Set<string>();
  collectKeys(tree, pending);
  while (pending.size > 0) {
    const [key] = pending;
    pending.delete(key);
    if (used.has(key)) continue;
    used.add(key);
    if (!Object.prototype.hasOwnProperty.call(components, key)) continue;
    const found = new Set<string>();
    collectKeys(components[key], found);
    for (const k of found) if (!used.has(k)) pending.add(k);
  }
  const out: Record<string, unknown> = {};
  for (const [key, master] of Object.entries(components)) if (used.has(key)) out[key] = master;
  return out as C;
}
