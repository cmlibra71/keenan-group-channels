"use client";

// People on the account (cards 8LfB0DZS + xqWftDcL).
//
// Two lists, because they are two different things and the card asks for both:
//   "Who has access" — the real people on the business account, with the role
//   each of them holds and what that role can do. This is where a manager sees
//   who is on the account.
//   "People we should contact" — the customer's own list of who to deal with.
//   These are contact details, NOT logins: saving one never grants access.
//
// After a save the screen renders the list the SERVER returned, not the boxes
// that were typed into, so what you see is what was stored.

import { useState } from "react";
import { Plus, Trash2, CreditCard, ShoppingCart, Pencil } from "lucide-react";
import { saveAccountPeople } from "@/lib/actions/account";
import type { AccountPerson } from "@/lib/account/account-people";
import type { AccountPeopleView } from "@/lib/account/account-people-data";

const EMPTY: AccountPerson = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  roleId: null,
  roleName: "",
  receivesEmails: false,
};

const INPUT =
  "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";
const LABEL = "block text-sm font-medium text-zinc-700";
const PILL =
  "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700";

function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "never"
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function AccountPeople({ view }: { view: AccountPeopleView }) {
  const [people, setPeople] = useState<AccountPerson[]>(view.people);
  const [draft, setDraft] = useState<AccountPerson[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = draft ?? people;
  const editing = draft !== null;
  const roles = view.roles;

  function edit(next: AccountPerson[]) {
    setDraft(next);
    setMsg(null);
  }
  function update(i: number, patch: Partial<AccountPerson>) {
    edit(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRow(i: number) {
    edit(rows.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    const result = await saveAccountPeople(draft);
    setSaving(false);
    if (!result.success) {
      setMsg({ ok: false, text: result.error || "Failed to save" });
      return;
    }
    // Render what the server stored, never the typed boxes.
    setPeople(result.people ?? []);
    setDraft(null);
    const told =
      result.notified && result.notified.length > 0
        ? ` We've let ${result.notified.join(" and ")} know.`
        : view.manager?.isYou
          ? " You're the account manager, so there was no one else to tell."
          : "";
    setMsg({ ok: true, text: `Saved.${told}` });
  }

  return (
    <div className="space-y-8">
      {msg && (
        <div className={`text-sm rounded-lg p-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {view.accountId !== null && (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Who has access</h3>
            <p className="text-sm text-zinc-500">
              {view.manager
                ? `Account manager: ${view.manager.name}${view.manager.email ? ` (${view.manager.email})` : ""}${view.manager.isYou ? " — that's you" : ""}.`
                : "No one on this account is set as the manager yet. Everyone below still has the access their role gives them — ask us if you'd like a manager set."}
            </p>
          </div>

          <ul className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg">
            {view.members.map((m) => (
              <li key={m.contactId} className="p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-zinc-900">{m.name}</span>
                  {m.isYou && <span className={PILL}>You</span>}
                  <span className="text-sm text-zinc-500">{m.email}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">
                  {m.roleName || "No role set"}
                  {m.role ? ` — ${m.role.summary}` : ""}
                </p>
                {m.role && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.role.canPayByCard && (
                      <span className={PILL}>
                        <CreditCard className="h-3 w-3" /> Can pay by card
                      </span>
                    )}
                    {m.role.canOrderForBusiness && (
                      <span className={PILL}>
                        <ShoppingCart className="h-3 w-3" />
                        {m.role.ordersNeedApproval ? "Orders need approval" : "Can order for the business"}
                      </span>
                    )}
                  </div>
                )}
                {m.activity && (
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {m.activity.orders} {m.activity.orders === 1 ? "order" : "orders"} placed · last order{" "}
                    {formatDate(m.activity.lastOrderAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">People we should contact</h3>
          <p className="text-sm text-zinc-500">
            Tell us who else we should deal with and what they should be able to do. These are
            contact details only — nobody added here can sign in until our team sets them up.
          </p>
        </div>

        {!view.canEdit && view.cannotEditReason && (
          <p className="text-sm text-zinc-500">{view.cannotEditReason}</p>
        )}

        {rows.length === 0 && !editing && (
          <p className="text-sm text-zinc-500">No one added yet.</p>
        )}

        {!editing &&
          rows.map((row, i) => {
            const role = roles.find((r) => r.id === row.roleId) ?? null;
            return (
              <div key={i} className="border border-zinc-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">{fullName(row) || "(no name)"}</p>
                    <p className="text-sm text-zinc-500">
                      {[row.email, row.phone].filter(Boolean).join(" · ") || "No contact details"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-700">
                      {role?.name || row.roleName || "No role chosen yet"}
                      {role ? ` — ${role.summary}` : ""}
                    </p>
                    {role && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {role.canPayByCard && (
                          <span className={PILL}>
                            <CreditCard className="h-3 w-3" /> Can pay by card
                          </span>
                        )}
                        {role.canOrderForBusiness && (
                          <span className={PILL}>
                            <ShoppingCart className="h-3 w-3" />
                            {role.ordersNeedApproval ? "Orders need approval" : "Can order for the business"}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.receivesEmails
                        ? "Included on the account's emails"
                        : "Not included on the account's emails"}
                    </p>
                  </div>
                  {view.canEdit && (
                    <button
                      type="button"
                      onClick={() => edit([...rows])}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}

        {editing &&
          rows.map((row, i) => {
            const role = roles.find((r) => r.id === row.roleId) ?? null;
            return (
              <div key={i} className="space-y-3 border border-zinc-200 rounded-lg p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
                  <div>
                    <label className={LABEL}>First name</label>
                    <input
                      type="text"
                      value={row.firstName}
                      onChange={(e) => update(i, { firstName: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Last name</label>
                    <input
                      type="text"
                      value={row.lastName}
                      onChange={(e) => update(i, { lastName: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Email</label>
                    <input
                      type="email"
                      value={row.email}
                      onChange={(e) => update(i, { email: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Phone</label>
                    <input
                      type="tel"
                      value={row.phone}
                      onChange={(e) => update(i, { phone: e.target.value })}
                      className={INPUT}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="Remove"
                    className="text-zinc-400 hover:text-red-600 p-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor={`role-${i}`}>
                      Role
                    </label>
                    <select
                      id={`role-${i}`}
                      value={row.roleId ?? ""}
                      onChange={(e) => {
                        const id = e.target.value ? Number(e.target.value) : null;
                        update(i, {
                          roleId: id,
                          roleName: roles.find((r) => r.id === id)?.name ?? "",
                        });
                      }}
                      className={INPUT}
                    >
                      <option value="">Choose a role…</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {row.roleId === null && row.roleName && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Previously saved as &ldquo;{row.roleName}&rdquo; — please pick a role from the list.
                      </p>
                    )}
                  </div>
                  <div className="sm:pt-6">
                    <label className="flex items-start gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={row.receivesEmails}
                        onChange={(e) => update(i, { receivesEmails: e.target.checked })}
                        className="mt-0.5"
                      />
                      Include them on the account&rsquo;s emails (orders, invoices, deliveries)
                    </label>
                  </div>
                </div>

                {role && (
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-900">What a {role.name} can do</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                      {role.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

        {view.canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => edit([...rows, { ...EMPTY }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add person
            </button>
            {editing && (
              <>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="bg-zinc-900 text-white py-1.5 px-3 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition-colors disabled:bg-zinc-300"
                >
                  {saving ? "Saving…" : "Save people"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setMsg(null);
                  }}
                  className="text-sm font-semibold text-zinc-600 hover:text-zinc-900"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        {view.accountId !== null && (
          <p className="text-xs text-zinc-500">
            {view.manager && !view.manager.isYou
              ? `${view.manager.name} is emailed whenever someone is added here, with their access level.`
              : view.manager
                ? "You're the account manager, so you're the one told when someone is added here."
                : "There's no manager set on this account, so no one is emailed when someone is added."}
          </p>
        )}
      </section>
    </div>
  );
}
