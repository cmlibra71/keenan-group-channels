"use server";

import { submitForm } from "./forms";

/**
 * The contact page's submit action — now a thin adapter over the form-builder
 * pipeline, so an enquiry is PERSISTED (and shows up in the portal) instead of
 * existing only as an email that can silently fail.
 *
 * The signature and return shape are unchanged, so ContactForm.tsx keeps
 * working untouched while the page migrates to a builder-composed form.
 */
export async function submitContact(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
  };

  const result = await submitForm({
    formKey: "general-enquiry",
    values,
    hp: String(formData.get("__hp") ?? formData.get("website") ?? ""),
    turnstileToken: String(formData.get("cf-turnstile-response") ?? "") || undefined,
    pagePath: "/contact",
  });

  return result.success ? { success: true } : { error: result.error };
}
