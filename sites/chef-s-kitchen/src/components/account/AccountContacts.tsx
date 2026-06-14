"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { updateAccountContacts, type AccountContact } from "@/lib/actions/account";

const EMPTY: AccountContact = { name: "", email: "", phone: "", role: "" };

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
        <div className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-accent-subtle text-accent-dark" : "bg-sale-bg border border-sale/30 text-sale-deep"}`}>
          {msg.text}
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-text-secondary">
          Add the people on your account (e.g. purchasing, accounts payable). This is
          optional and just helps our team reach the right person.
        </p>
      )}

      {rows.map((row, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end border border-border rounded-lg p-3">
          <div>
            <label className="field-label">Name</label>
            <input type="text" value={row.name} onChange={(e) => update(i, "name", e.target.value)} className="mt-1 block w-full input" />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input type="email" value={row.email} onChange={(e) => update(i, "email", e.target.value)} className="mt-1 block w-full input" />
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input type="tel" value={row.phone} onChange={(e) => update(i, "phone", e.target.value)} className="mt-1 block w-full input" />
          </div>
          <div>
            <label className="field-label">Role</label>
            <input type="text" value={row.role} onChange={(e) => update(i, "role", e.target.value)} className="mt-1 block w-full input" />
          </div>
          <button type="button" onClick={() => removeRow(i)} aria-label="Remove" className="text-steel-400 hover:text-sale p-2">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button type="button" onClick={addRow} className="btn-secondary btn-sm">
          <Plus className="h-3.5 w-3.5" /> Add person
        </button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
          {saving ? "Saving…" : "Save people"}
        </button>
      </div>
    </div>
  );
}
