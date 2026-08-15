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
        <div className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-zinc-700">First name</label>
          <input id="firstName" name="firstName" type="text" required defaultValue={firstName} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-zinc-700">Last name</label>
          <input id="lastName" name="lastName" type="text" required defaultValue={lastName} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-zinc-700">Business / company (optional)</label>
          <input id="company" name="company" type="text" defaultValue={company} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-zinc-700">Phone</label>
          {/* Required here and nowhere else (card xqWftDcL): the server refuses a
              blank one too, sign-up is unchanged, and no order is ever blocked on it. */}
          <input id="phone" name="phone" type="tel" required defaultValue={phone} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none" />
          <p className="mt-1 text-xs text-zinc-500">So we can reach you about an order or a delivery.</p>
        </div>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">Email</label>
        <input id="email" type="email" value={email} disabled className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-zinc-50 text-zinc-500 cursor-not-allowed" />
        <p className="mt-1 text-xs text-zinc-500">
          Manage your password on the{" "}
          <a href="/account/security" className="text-zinc-900 font-medium hover:underline">
            security page
          </a>
          . To change the email on your account, please{" "}
          <a href="/pages/contact" className="text-zinc-900 font-medium hover:underline">
            contact us
          </a>
          .
        </p>
      </div>
      <button type="submit" disabled={saving} className="bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition-colors disabled:bg-zinc-300">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
