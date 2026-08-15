"use client";

import { useEffect, useRef, useState } from "react";
import type { FormFieldDef } from "@keenan/services/finance";
import { newUploadToken } from "@/lib/checkout/finance";
import { submitFinanceApplication } from "@/lib/actions/finance-application";

// ============================================================================
// The finance application, on the SilverChef page (card 6f47rFeT).
//
// THE QUESTIONS ARE NOT WRITTEN HERE — they are rendered from the stored field
// contract (`@keenan/services` financeApplicationFields, card VAjaPj0t), the
// same list the server validates against and the same list the checkout panel
// renders. A question added in the portal appears here without a deploy, and
// the form on screen can never ask for something the server rejects.
//
// Licence and Medicare photos are OPTIONAL, deliberately (VAjaPj0t): an
// application is read by a person who can chase a photo, and the shopper may
// not have their cards on the desk.
// ============================================================================

const inputClass =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-text-primary focus:outline-none focus:ring-1 focus:ring-text-primary";

type UploadState = { uploading: boolean; files: string[]; error: string | null };

export function FinanceApplicationForm({
  fields,
  intro,
  attachmentPrompts,
  accountNumberTrigger,
  formKey,
}: {
  fields: FormFieldDef[];
  intro: string;
  attachmentPrompts: { name: string; label: string; hint: string }[];
  /** The one funding-type answer that asks for a SilverChef account number. */
  accountNumberTrigger: string;
  formKey: string;
}) {
  const mountedAt = useRef(Date.now());
  const uploadToken = useRef<string>("");
  const [fundingType, setFundingType] = useState("");
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The CHECKOUT's helper, not a second copy: it is unit-tested against the
    // upload route's own TOKEN_RE (/^[0-9a-f-]{36}$/i), and hand-rolling the
    // fallback is exactly the bug that killed every photo upload at checkout —
    // `Date.now().toString(16)` is 11 hex characters, so the token came out 39
    // long and the route answered "Invalid upload session." wherever
    // crypto.randomUUID is missing (an http:// origin, an older in-app browser).
    uploadToken.current = newUploadToken();
  }, []);

  const uploading = Object.values(uploads).some((u) => u.uploading);

  async function uploadFiles(fieldName: string, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setUploads((prev) => ({
      ...prev,
      [fieldName]: { uploading: true, files: prev[fieldName]?.files ?? [], error: null },
    }));
    const done: string[] = [];
    let failed: string | null = null;
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      body.set("formKey", formKey);
      body.set("uploadToken", uploadToken.current);
      body.set("fieldName", fieldName);
      try {
        const res = await fetch("/api/forms/upload", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (res.ok && json?.success) done.push(file.name);
        else failed = json?.error || `Couldn't attach ${file.name}.`;
      } catch {
        failed = `Couldn't attach ${file.name}.`;
      }
      if (failed) break;
    }
    setUploads((prev) => ({
      ...prev,
      [fieldName]: { uploading: false, files: [...(prev[fieldName]?.files ?? []), ...done], error: failed },
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploading) return;
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    for (const field of fields) {
      const raw = data.get(field.name);
      if (typeof raw === "string") values[field.name] = raw;
    }
    try {
      const result = await submitFinanceApplication({
        values,
        uploadToken: uploadToken.current,
        hp: String(data.get("company_website_url") ?? ""),
        t: mountedAt.current,
      });
      if (result.success) setDone(true);
      else setError(result.error ?? "Sorry — we couldn't send that. Please try again.");
    } catch {
      setError("Sorry — we couldn't send that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-surface-primary p-6">
        <h3 className="text-lg font-semibold text-text-primary">Thanks — your application is on its way.</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Our team will be in touch to finish it off. Nothing has been charged and you are not
          committed to anything yet.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-border bg-surface-primary p-6">
      <p className="text-sm text-text-secondary">{intro}</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const wide = field.type === "textarea" || field.name === "funding_type";
          if (field.name === "silverchef_account_number" && fundingType !== accountNumberTrigger) {
            return null;
          }
          const label = (
            <label htmlFor={field.name} className="mb-1 block text-sm font-medium text-text-body">
              {field.label}
              {field.required ? " *" : ""}
            </label>
          );

          if (field.type === "select") {
            return (
              <div key={field.name} className={wide ? "sm:col-span-2" : undefined}>
                {label}
                <select
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  className={inputClass}
                  value={field.name === "funding_type" ? fundingType : undefined}
                  onChange={
                    field.name === "funding_type" ? (e) => setFundingType(e.target.value) : undefined
                  }
                  defaultValue={field.name === "funding_type" ? undefined : ""}
                >
                  <option value="">Please choose…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "textarea") {
            return (
              <div key={field.name} className="sm:col-span-2">
                {label}
                <textarea
                  id={field.name}
                  name={field.name}
                  required={field.required}
                  rows={3}
                  className={inputClass}
                />
              </div>
            );
          }

          return (
            <div key={field.name}>
              {label}
              <input
                id={field.name}
                name={field.name}
                type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                required={field.required}
                className={inputClass}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {attachmentPrompts.map((prompt) => {
          const state = uploads[prompt.name];
          return (
            <div key={prompt.name}>
              <label htmlFor={prompt.name} className="mb-1 block text-sm font-medium text-text-body">
                {prompt.label}
              </label>
              <input
                id={prompt.name}
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf"
                className="block w-full text-sm text-text-secondary"
                onChange={(e) => uploadFiles(prompt.name, e.target.files)}
              />
              <p className="mt-1 text-xs text-text-muted">{prompt.hint}</p>
              {state?.files.length ? (
                <p className="mt-1 text-xs text-text-secondary">Attached: {state.files.join(", ")}</p>
              ) : null}
              {state?.error ? <p className="mt-1 text-xs text-sale">{state.error}</p> : null}
            </div>
          );
        })}
      </div>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="company_website_url">Leave this field empty</label>
        <input id="company_website_url" name="company_website_url" tabIndex={-1} autoComplete="off" />
      </div>

      {error ? <p className="mt-4 text-sm text-sale">{error}</p> : null}

      {/* Utility classes, not a site button class: `.btn-primary` is in Chefs
          Depot's stylesheet and not in Industry Kitchens', and this renders on both. */}
      <button
        type="submit"
        disabled={pending || uploading}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-surface-dark px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : uploading ? "Attaching photos…" : "Submit application"}
      </button>
      <p className="mt-3 text-xs text-text-muted">
        Applying does not commit you to anything and nothing is charged. Approval is subject to the
        finance company&apos;s own checks.
      </p>
    </form>
  );
}
