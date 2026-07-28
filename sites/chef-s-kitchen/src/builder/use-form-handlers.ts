"use client";
import * as React from "react";
import { submitForm } from "@/lib/actions/forms";

// ============================================================================
// The `submitForm` facade Action for builder-composed forms.
//
// The tree's submit event passes `@form` (the whole FormData) plus the form's
// key; this unpacks the fields, hands files off to the upload route (which
// already ran, client-side, before submit), and returns the explicit
// {success} shape the action runner expects.
// ============================================================================

export function useFormHandlers() {
  return React.useMemo(
    () => ({
      submitForm: async (args: Record<string, unknown>) => {
        const fd = args.form instanceof FormData ? args.form : null;
        if (!fd) return { success: false, error: "This form isn't wired up correctly." };

        const values: Record<string, unknown> = {};
        let hp: string | undefined;
        let t: number | undefined;
        let turnstileToken: string | undefined;
        for (const [k, v] of fd.entries()) {
          if (v instanceof File) continue; // attachments upload separately
          const s = String(v);
          if (k === "__hp" || k === "website") hp = s;
          else if (k === "__t") t = Number(s);
          else if (k === "cf-turnstile-response") turnstileToken = s;
          else if (k.startsWith("__")) continue;
          else values[k] = s;
        }

        const formKey = typeof args.formKey === "string" ? args.formKey : String(fd.get("__formKey") ?? "");
        const uploadToken =
          typeof args.uploadToken === "string" ? args.uploadToken : String(fd.get("__uploadToken") ?? "") || undefined;

        return submitForm({
          formKey,
          values,
          uploadToken,
          hp,
          t,
          turnstileToken,
          pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        });
      },
    }),
    []
  );
}
