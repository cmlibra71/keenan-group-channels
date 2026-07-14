"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { BuilderTree, BuilderActionsProvider } from "@keenan/services/builder-react";

// ============================================================================
// A CONTENT page rendered from a node tree (Site Builder) — the generic,
// product-free sibling of BuilderProductPage. Used by /pages/[slug] for
// one-off pages (custom pages, contact, policies once they migrate). No
// purchase provider — bindings see { page: { slug, title } } plus whatever
// future contexts add. Cart/quote Actions are not wired here (no-op); internal
// links navigate through next/link.
// ============================================================================

export function BuilderContentPage({
  tree,
  page,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  page: { slug: string; title: string };
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
}) {
  const router = useRouter();
  return (
    <BuilderActionsProvider handlers={{}} navigate={(to) => router.push(to)}>
      <BuilderTree
        tree={tree}
        payload={{ page }}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={components}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={Image as unknown as React.ComponentType<Record<string, unknown>>}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
