"use client";
import * as React from "react";
import {
  type BuilderNode,
  type ElementNode,
  type EventAction,
  type FollowUp,
  type NodeCondition,
  type NodeEvent,
  type RepeatNode,
  type TextPart,
  type NodeTree,
  resolveBinding,
  type AttrValue,
  type ProductPagePayload,
} from "@keenan/services/builder";
import { BuilderDataCtx, useBuilderData, type BuilderData } from "./BuilderDataContext";
import {
  useBuilderActions,
  useBuilderLocalState,
  BuilderLocalStateProvider,
  type BuilderActionsApi,
  type LocalStateApi,
} from "./BuilderActions";

// ============================================================================
// NodeRenderer — walks a NodeTree and emits real React (no html-react-parser,
// no string splice). Bindings resolve against the aggregate payload + repeat
// scope; conditions gate inclusion (excluded ⇒ not rendered); Repeat maps a
// bound collection over one item subtree; Component-ref renders a library
// master with a props scope. Every element carries data-node-id (selection +
// ops targeting). Interactive wiring (events → facade Actions) layers on in a
// following increment via the same node model — this core is server-renderable
// and covers structure + data + repeat + conditions.
// ============================================================================

/** A component master's tree, keyed for Component-ref resolution. */
export type ComponentTrees = Record<string, NodeTree>;

const ComponentTreesCtx = React.createContext<ComponentTrees>({});

function formatValue(value: unknown, formatters?: string[]): string {
  let v = value;
  for (const f of formatters ?? []) {
    if (f === "upper") v = String(v).toUpperCase();
    else if (f === "lower") v = String(v).toLowerCase();
    else if (f.startsWith("money")) {
      const n = typeof v === "string" ? parseFloat(v) : (v as number);
      v = Number.isFinite(n) ? n.toFixed(2) : "";
    }
  }
  return v == null ? "" : String(v);
}

function resolve(data: BuilderData, path: string): unknown {
  return resolveBinding(data.payload, path, data.scope);
}

function conditionHolds(
  cond: NodeCondition | undefined,
  data: BuilderData,
  local: LocalStateApi | null
): boolean {
  if (!cond) return true;
  if (cond.kind === "state") {
    const v = local?.get(cond.ref) ?? data.scope[cond.ref];
    return cond.equals === undefined ? !!v : v === cond.equals;
  }
  if (cond.kind === "data") {
    const v = resolve(data, cond.path);
    const truthy = cond.equals === undefined ? !!v : v === cond.equals;
    return cond.not ? !truthy : truthy;
  }
  // "expr" — TS-authored named condition; resolved by the logic layer. Until
  // that lands, default to visible (never hide content because logic is absent).
  return true;
}

function renderText(parts: TextPart[], data: BuilderData): string {
  return parts
    .map((p) => (p.kind === "static" ? p.value : formatValue(resolve(data, p.path), p.formatters)))
    .join("");
}

function resolveArgs(
  args: Record<string, AttrValue> | undefined,
  data: BuilderData
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {}))
    out[k] = v.kind === "static" ? v.value : resolve(data, v.path);
  return out;
}

function runFollowUps(followUps: FollowUp[] | undefined, actions: BuilderActionsApi | null, local: LocalStateApi | null) {
  for (const f of followUps ?? []) {
    if (f.kind === "toast") actions?.toast(f.tone, f.message);
    else if (f.kind === "navigate") actions?.navigate(f.to);
    else if (f.kind === "set-state") local?.set(f.ref, f.value);
  }
}

/** Dispatch one event's action (local codeless op or a facade Action). Exported for tests. */
export async function dispatchEvent(
  action: EventAction,
  data: BuilderData,
  actions: BuilderActionsApi | null,
  local: LocalStateApi | null
) {
  if (action.kind === "local") {
    switch (action.op) {
      case "toggle":
        if (action.target) local?.set(action.target, "toggle");
        break;
      case "set-index":
        if (action.target && typeof action.value === "number") local?.set(action.target, action.value);
        break;
      case "copy":
        if (typeof action.value === "string" && typeof navigator !== "undefined")
          navigator.clipboard?.writeText(action.value);
        break;
      case "scroll-to":
        if (typeof action.target === "string")
          document.getElementById(action.target)?.scrollIntoView({ behavior: "smooth" });
        break;
      // "dismiss" is handled by the app-tier container; no-op here.
    }
    return;
  }
  // Facade Action + typed-result follow-ups.
  const result = await (actions?.run(action.ref, resolveArgs(action.args, data)) ?? Promise.resolve({ ok: false }));
  runFollowUps(result.ok ? action.onSuccess : action.onError, actions, local);
}

const DOM_EVENT: Record<NodeEvent["on"], string | null> = {
  click: "onClick",
  change: "onChange",
  submit: "onSubmit",
  mouseenter: "onMouseEnter",
  mouseleave: "onMouseLeave",
  keydown: "onKeyDown",
  mount: null, // handled via effect
  "in-view": null, // handled via IntersectionObserver (future)
};

function ElementRenderer({ node, data }: { node: ElementNode; data: BuilderData }): React.ReactElement | null {
  const actions = useBuilderActions();
  const local = useBuilderLocalState();
  const className = [...(node.classes ?? []), ...(node.styleRefs ?? [])].join(" ") || undefined;
  const props: Record<string, unknown> = { "data-node-id": node.id };
  if (className) props.className = className;
  for (const [k, v] of Object.entries(node.attrs ?? {})) {
    const val = v.kind === "static" ? v.value : formatValue(resolve(data, v.path), v.formatters);
    // Omit empty/absent values — never emit src="" / href="" (browser refetch,
    // invalid links) or blank attrs from unresolved bindings.
    if (val === "" || val == null) continue;
    props[k] = val;
  }

  // Wire declared events to DOM handlers (client tier).
  for (const e of node.events ?? []) {
    const handlerName = DOM_EVENT[e.on];
    if (!handlerName) continue;
    props[handlerName] = (ev: React.SyntheticEvent) => {
      if (e.on === "submit") ev.preventDefault();
      void dispatchEvent(e.action, data, actions, local);
    };
  }
  // on-mount event.
  const mountEvent = (node.events ?? []).find((e) => e.on === "mount");
  React.useEffect(() => {
    if (mountEvent) void dispatchEvent(mountEvent.action, data, actions, local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Tag = node.tag as keyof React.JSX.IntrinsicElements;

  // Rich HTML binding (sanitized upstream by the payload producer).
  if (node.richBinding) {
    const html = String(resolve(data, node.richBinding) ?? "");
    return <Tag {...props} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (node.text?.length) {
    return <Tag {...props}>{renderText(node.text, data)}</Tag>;
  }
  const kids = node.children ?? [];
  // Void elements can't take children.
  if (["img", "br", "hr", "input", "source"].includes(node.tag)) return <Tag {...props} />;
  return (
    <Tag {...props}>
      {kids.map((c) => (
        <NodeRenderer key={c.id} node={c} />
      ))}
    </Tag>
  );
}

function RepeatRenderer({ node, data }: { node: RepeatNode; data: BuilderData }): React.ReactElement {
  const raw = resolve(data, node.source);
  const items = Array.isArray(raw) ? raw : [];
  const alias = node.itemAlias ?? "item";
  const limited = typeof node.limit === "number" ? items.slice(0, node.limit) : items;

  if (!limited.length && node.emptyChildren?.length) {
    return (
      <>
        {node.emptyChildren.map((c) => (
          <NodeRenderer key={c.id} node={c} />
        ))}
      </>
    );
  }

  return (
    <>
      {limited.map((item, i) => {
        const childData: BuilderData = {
          ...data,
          scope: { ...data.scope, [alias]: item, "@index": i, "@first": i === 0, "@last": i === limited.length - 1 },
        };
        return (
          <BuilderDataCtx.Provider key={i} value={childData}>
            {node.children.map((c) => (
              <NodeRenderer key={c.id} node={c} />
            ))}
          </BuilderDataCtx.Provider>
        );
      })}
    </>
  );
}

function ComponentRefRenderer({
  node,
  data,
}: {
  node: Extract<BuilderNode, { kind: "component" }>;
  data: BuilderData;
}): React.ReactElement | null {
  const trees = React.useContext(ComponentTreesCtx);
  const tree = trees[node.componentKey];
  if (!tree) return data.draft ? <div data-node-id={node.id}>[missing component: {node.componentKey}]</div> : null;
  // Props become a scope frame the master's bindings can read as "props.*".
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.props ?? {}))
    props[k] = v.kind === "static" ? v.value : resolve(data, v.path);
  const childData: BuilderData = { ...data, scope: { ...data.scope, props } };
  return (
    <BuilderDataCtx.Provider value={childData}>
      <NodeRenderer node={tree.root} />
    </BuilderDataCtx.Provider>
  );
}

/** Render a single node (reads BuilderDataCtx + local state). */
export function NodeRenderer({ node }: { node: BuilderNode }): React.ReactElement | null {
  const data = useBuilderData();
  const local = useBuilderLocalState();
  if (!conditionHolds(node.condition, data, local)) return null;
  let rendered: React.ReactElement | null;
  switch (node.kind) {
    case "element":
      rendered = <ElementRenderer node={node} data={data} />;
      break;
    case "repeat":
      rendered = <RepeatRenderer node={node} data={data} />;
      break;
    case "component":
      rendered = <ComponentRefRenderer node={node} data={data} />;
      break;
    case "code":
      rendered = <div data-node-id={node.id} dangerouslySetInnerHTML={{ __html: node.html }} />;
      break;
    default:
      rendered = null;
  }
  // An element that declares local state seeds a provider for its subtree.
  if (node.kind === "element" && node.state?.length) {
    const initial: Record<string, boolean | number> = {};
    for (const s of node.state) if (s.initial !== undefined) initial[s.name] = s.initial;
    return <BuilderLocalStateProvider initial={initial}>{rendered}</BuilderLocalStateProvider>;
  }
  return rendered;
}

/** Top-level: render a whole tree against a payload. */
export function BuilderTree({
  tree,
  payload,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  payload: ProductPagePayload;
  components?: ComponentTrees;
  draft?: boolean;
}): React.ReactElement {
  return (
    <ComponentTreesCtx.Provider value={components}>
      <BuilderDataCtx.Provider value={{ payload, scope: {}, draft }}>
        <NodeRenderer node={tree.root} />
      </BuilderDataCtx.Provider>
    </ComponentTreesCtx.Provider>
  );
}
