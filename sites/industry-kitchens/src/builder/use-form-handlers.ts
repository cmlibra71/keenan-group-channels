"use client";
import * as React from "react";
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
