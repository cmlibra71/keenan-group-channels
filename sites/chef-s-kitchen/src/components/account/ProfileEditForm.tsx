"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerProfile } from "@/lib/actions/account";

export function ProfileEditForm({
  firstName,
  lastName,
  email,
  company,
  phone,
}: {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  phone: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const result = await updateCustomerProfile({
      firstName: (fd.get("firstName") as string) || "",
      lastName: (fd.get("lastName") as string) || "",
      company: (fd.get("company") as string) || "",
      phone: (fd.get("phone") as string) || "",
    });
    setSaving(false);
    setMsg(result.success ? { ok: true, text: "Saved." } : { ok: false, text: result.error || "Failed to save" });
    if (result.success) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-accent-subtle text-accent-dark" : "bg-sale-bg border border-sale/30 text-sale-deep"}`}>
          {msg.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="field-label">First name</label>
          <input id="firstName" name="firstName" type="text" required defaultValue={firstName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label htmlFor="lastName" className="field-label">Last name</label>
          <input id="lastName" name="lastName" type="text" required defaultValue={lastName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label htmlFor="company" className="field-label">Business / company</label>
          <input id="company" name="company" type="text" defaultValue={company} className="mt-1 block w-full input" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">Phone</label>
          <input id="phone" name="phone" type="tel" defaultValue={phone} className="mt-1 block w-full input" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input id="email" type="email" value={email} disabled className="mt-1 block w-full input bg-steel-50 text-steel-500 cursor-not-allowed" />
        <p className="mt-1 text-xs text-text-secondary">Contact us to change the email on your account.</p>
      </div>
      <button type="submit" disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
