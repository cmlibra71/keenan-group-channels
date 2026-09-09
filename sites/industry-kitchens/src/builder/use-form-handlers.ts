"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { NodeTree } from "@keenan/services/builder";
import { withFormConfirmations, withFormConfirmationsIn } from "@keenan/services/builder";
import { submitForm } from "@/lib/actions/forms";

// ============================================================================
// The `submitForm` facade Action for builder-composed forms.
//
// The tree's submit event passes `@form` (the whole FormData) plus the form's
// key; this unpacks the fields, uploads any attachments, and returns the
// explicit {success} shape the action runner expects.
//
// Attachments go through the upload route FIRST, keyed by a token minted here,
// and the token is handed to the submit action which claims them. A server
// action cannot stream a 10MB file, and the route is where the size cap,
// magic-byte sniff and rate limits live.
// ============================================================================

/** Push one file through the upload route. Returns an error string, or null. */
async function uploadOne(
  file: File,
  formKey: string,
  uploadToken: string,
  fieldName: string
): Promise<string | null> {
  const body = new FormData();
  body.set("file", file);
  body.set("formKey", formKey);
  body.set("uploadToken", uploadToken);
  body.set("fieldName", fieldName);
  try {
    const res = await fetch("/api/forms/upload", { method: "POST", body });
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
    if (res.ok && json?.success) return null;
    return json?.error || `Couldn't attach ${file.name}.`;
  } catch {
    return `Couldn't attach ${file.name}.`;
  }
}

export function useFormHandlers() {
  const router = useRouter();
  return React.useMemo(
    () => ({
      submitForm: async (args: Record<string, unknown>) => {
        const fd = args.form instanceof FormData ? args.form : null;
        if (!fd) return { success: false, error: "This form isn't wired up correctly." };

        const values: Record<string, unknown> = {};
        const files: { file: File; fieldName: string }[] = [];
        let hp: string | undefined;
        let t: number | undefined;
        let turnstileToken: string | undefined;
        for (const [k, v] of fd.entries()) {
          if (v instanceof File) {
            // An empty file input still yields a zero-byte File named "".
            if (v.size > 0 && v.name) files.push({ file: v, fieldName: k });
            continue;
          }
          const s = String(v);
          if (k === "__hp" || k === "website") hp = s;
          else if (k === "__t") t = Number(s);
          else if (k === "cf-turnstile-response") turnstileToken = s;
          else if (k.startsWith("__")) continue;
          else values[k] = s;
        }

        const formKey = typeof args.formKey === "string" ? args.formKey : String(fd.get("__formKey") ?? "");
        let uploadToken =
          typeof args.uploadToken === "string" ? args.uploadToken : String(fd.get("__uploadToken") ?? "") || undefined;

        if (files.length) {
          uploadToken ||= crypto.randomUUID();
          for (const { file, fieldName } of files) {
            const error = await uploadOne(file, formKey, uploadToken, fieldName);
            // Stop on the first rejection: sending the enquiry anyway would
            // quietly lose the very file the visitor was writing about.
            if (error) return { success: false, error };
          }
        }

        const result = await submitForm({
          formKey,
          values,
          uploadToken,
          hp,
          t,
          turnstileToken,
          pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
        // A destination the form's author set wins over the confirmation
        // message (card XBOxpQmd). It is always a site-relative path — the
        // action re-checks it through the same guard the redirect table uses —
        // so this is a client navigation, never a jump off the storefront.
        // The result is still returned: if the navigation is slow, the success
        // panel is what the visitor looks at meanwhile, and their enquiry is
        // already stored either way.
        if (result.success && result.redirectTo) router.push(result.redirectTo);
        return result;
      },
    }),
    [router]
  );
}

/**
 * The tree and component masters a page renders, with every form success panel
 * able to show its form's AUTHORED confirmation message (card XBOxpQmd).
 *
 * Pure and data-free: a page with no form gets its own objects back, so this
 * costs one walk and changes nothing. It exists because the panels already
 * published — including the shared `enquiry-form` master both storefronts place
 * on their contact page — carry sentences written into the tree, and would
 * otherwise ignore anything Steve types on the Forms screen.
 */
export function useFormConfirmations(
  tree: NodeTree,
  components: Record<string, NodeTree> | undefined
): { tree: NodeTree; components: Record<string, NodeTree> } {
  const given = components ?? EMPTY_COMPONENTS;
  return {
    tree: React.useMemo(() => withFormConfirmations(tree), [tree]),
    components: React.useMemo(() => withFormConfirmationsIn(given), [given]),
  };
}

/** Stable identity so a page that passes no masters never remounts the memo. */
const EMPTY_COMPONENTS: Record<string, NodeTree> = {};
