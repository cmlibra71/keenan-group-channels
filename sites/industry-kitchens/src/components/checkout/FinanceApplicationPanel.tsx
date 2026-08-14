"use client";

import { useEffect, useState } from "react";
import type { FinanceOffer } from "@/lib/checkout/finance";

// ============================================================================
// The finance application, inside the checkout (card VAjaPj0t).
//
// Tim, 2026-08-11: "Finance Checkout button surfaces form within website" —
// this is the Monday form (wkf.ms/3spftRC) rebuilt in our own forms backend.
// The QUESTIONS ARE NOT WRITTEN HERE: they are rendered from the stored field
// contract (@keenan/services `financeApplicationFields`), which is the same
// list the server validates against, so the form on screen and the form the
// server accepts cannot drift apart.
//
// Every input is named `finance_<field>` so placeOrder can lift the application
// out of the checkout FormData without colliding with the order's own fields.
//
// Attachments (licence, Medicare) go through the existing anonymous upload
// route FIRST, keyed by an upload token that placeOrder hands to the submission
// so the files are claimed atomically. A server action cannot stream a 10MB
// file, and the route is where the size cap and magic-byte sniff live.
// ============================================================================

const inputClass =
  "w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 text-sm";

type UploadState = { uploading: boolean; files: string[]; error: string | null };

export function FinanceApplicationPanel({
  methodId,
  offer,
  uploadToken,
  onUploadingChange,
}: {
  methodId: string;
  offer: FinanceOffer;
  uploadToken: string;
  /** Place Order stays disabled while a photo is still going up, or the file
   *  would arrive after the application had already claimed its attachments. */
  onUploadingChange: (uploading: boolean) => void;
}) {
  const fundingTypes = offer.fundingTypesByMethod[methodId] ?? [];
  const [fundingType, setFundingType] = useState("");
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});

  // A funding type chosen under one button must not survive a switch to the
  // other — the two buttons offer different lists.
  useEffect(() => {
    setFundingType("");
  }, [methodId]);

  const uploading = Object.values(uploads).some((u) => u.uploading);
  useEffect(() => {
    onUploadingChange(uploading);
  }, [uploading, onUploadingChange]);

  async function uploadFiles(fieldName: string, fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setUploads((prev) => ({
      ...prev,
      [fieldName]: { uploading: true, files: prev[fieldName]?.files ?? [], error: null },
    }));
    const done: string[] = [];
    let error: string | null = null;
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      body.set("formKey", offer.formKey);
      body.set("uploadToken", uploadToken);
      body.set("fieldName", fieldName);
      try {
        const res = await fetch("/api/forms/upload", { method: "POST", body });
        const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (res.ok && json?.success) done.push(file.name);
        else error = json?.error || `Couldn't attach ${file.name}.`;
      } catch {
        error = `Couldn't attach ${file.name}.`;
      }
      if (error) break;
    }
    setUploads((prev) => ({
      ...prev,
      [fieldName]: {
        uploading: false,
        files: [...(prev[fieldName]?.files ?? []), ...done],
        error,
      },
    }));
  }

  return (
    <div className="mt-2 ml-6 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
      <p className="text-sm text-zinc-700">
        Your order is placed now and <strong>nothing is charged</strong>. We&apos;ll send this
        application to our finance team and be in touch — payment is arranged once your finance is
        approved.
      </p>
      <p className="mt-2 text-xs text-zinc-500">{offer.intro}</p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {offer.fields.map((field) => {
          const name = `finance_${field.name}`;
          const label = (
            <label htmlFor={name} className="block text-sm font-medium text-zinc-700 mb-1">
              {field.label}
              {field.required ? " *" : ""}
            </label>
          );
          const wide = field.type === "textarea" || field.name === "funding_type";

          if (field.name === "silverchef_account_number" && fundingType !== offer.accountNumberTrigger) {
            return null;
          }

          if (field.name === "funding_type") {
            return (
              <div key={name} className="sm:col-span-2">
                {label}
                <select
                  id={name}
                  name={name}
                  required={field.required}
                  value={fundingType}
                  onChange={(e) => setFundingType(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Please select…</option>
                  {fundingTypes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "select") {
            return (
              <div key={name} className={wide ? "sm:col-span-2" : undefined}>
                {label}
                <select id={name} name={name} required={field.required} defaultValue="" className={inputClass}>
                  <option value="">Please select…</option>
                  {(field.options ?? []).map((option: string) => (
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
              <div key={name} className="sm:col-span-2">
                {label}
                <textarea id={name} name={name} required={field.required} rows={2} className={inputClass} />
              </div>
            );
          }

          return (
            <div key={name} className={wide ? "sm:col-span-2" : undefined}>
              {label}
              <input
                id={name}
                name={name}
                type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
                required={field.required}
                className={inputClass}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        {offer.attachmentPrompts.map((prompt) => {
          const state = uploads[prompt.name];
          return (
            <div key={prompt.name}>
              <label className="block text-sm font-medium text-zinc-700 mb-1">{prompt.label}</label>
              <p className="text-xs text-zinc-500 mb-1">{prompt.hint}</p>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => uploadFiles(prompt.name, e.target.files)}
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800"
              />
              {state?.uploading && <p className="mt-1 text-xs text-zinc-500">Uploading…</p>}
              {state?.files.length ? (
                <p className="mt-1 text-xs text-green-700">Attached: {state.files.join(", ")}</p>
              ) : null}
              {state?.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
            </div>
          );
        })}
        <p className="text-xs text-zinc-500">
          Haven&apos;t got these to hand? You can still place the order — we&apos;ll ask for them
          before the finance is settled.
        </p>
      </div>

      <input type="hidden" name="financeUploadToken" value={uploadToken} />
    </div>
  );
}
