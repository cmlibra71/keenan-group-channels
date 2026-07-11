"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { updateAccountContacts, type AccountContact } from "@/lib/actions/account";

const EMPTY: AccountContact = { name: "", email: "", phone: "", role: "" };

const INPUT =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
const LABEL = "block text-sm font-medium text-zinc-700";

export function AccountContacts({ initial }: { initial: AccountContact[] }) {
  const [rows, setRows] = useState<AccountContact[]>(initial.length ? initial : []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function update(i: number, key: keyof AccountContact, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { ...EMPTY }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const result = await updateAccountContacts(rows);
    setSaving(false);
    setMsg(result.success ? { ok: true, text: "Saved." } : { ok: false, text: result.error || "Failed to save" });
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">
          Add the people on your account (e.g. purchasing, accounts payable). This is
          optional and just helps our team reach the right person.
        </p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end border border-zinc-200 rounded-lg p-3">
          <div>
            <label className={LABEL}>Name</label>
            <input type="text" value={row.name} onChange={(e) => update(i, "name", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input type="email" value={row.email} onChange={(e) => update(i, "email", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input type="tel" value={row.phone} onChange={(e) => update(i, "phone", e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Role</label>
            <input type="text" value={row.role} onChange={(e) => update(i, "role", e.target.value)} className={INPUT} />
          </div>
          <button type="button" onClick={() => removeRow(i)} aria-label="Remove" className="text-zinc-400 hover:text-red-600 p-2">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add person
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-zinc-900 text-white py-1.5 px-3 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
        >
          {saving ? "Saving…" : "Save people"}
        </button>
      </div>
    </div>
  );
}
