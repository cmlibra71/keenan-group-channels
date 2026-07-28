"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { ContactForm } from "@/components/contact/ContactForm";
import { BuilderTree, BuilderActionsProvider, type NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// A CONTENT page rendered from a node tree (Site Builder) — the generic,
// product-free sibling of BuilderProductPage. Used by /pages/[slug] for
// one-off pages AND the shared policy layout. The payload is composed by the
// route via the SHARED composers (@keenan/services page-payloads) — the same
// functions the portal designer samples with, so bindings resolve identically.
// Cart/quote Actions are not wired here (no-op); internal links navigate
// through next/link.
// ============================================================================

export function BuilderContentPage({
  tree,
  payload,
  namedStyles = {},
  jsFunctions,
  callResults,
  components = {},
  draft = false,
}: {
  tree: NodeTree;
  /** Composed page payload ({ context, page } — composeContentPagePayload). */
  payload: object;
  namedStyles?: Record<string, string[]>;
  jsFunctions?: Record<string, string>;
  callResults?: Record<string, unknown>;
  components?: Record<string, NodeTree>;
  draft?: boolean;
}) {
  const router = useRouter();
  const nativeComponents: NativeComponents = { "contact-form": () => <ContactForm /> };
  // Content/landing pages are exactly where enquiry forms go, and they
  // registered NO actions at all until now.
  const formHandlers = useFormHandlers();
  return (
    <BuilderActionsProvider handlers={formHandlers} navigate={(to) => router.push(to)}>
      <BuilderTree
        tree={tree}
        payload={payload}
        namedStyles={namedStyles}
        jsFunctions={jsFunctions}
        callResults={callResults}
        components={components}
        nativeComponents={nativeComponents}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={Image as unknown as React.ComponentType<Record<string, unknown>>}
        draft={draft}
      />
    </BuilderActionsProvider>
  );
}
