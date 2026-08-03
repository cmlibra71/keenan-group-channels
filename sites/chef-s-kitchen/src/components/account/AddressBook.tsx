"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { AU_STATES, normaliseAuState } from "@/lib/checkout/au-address";
import {
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  setDefaultAddress,
  type AddressInput,
} from "@/lib/actions/account";

export type Address = {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

export function AddressBook({
  addresses,
  googlePlacesEnabled = false,
}: {
  addresses: Address[];
  googlePlacesEnabled?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete(id: number) {
    setBusy(true);
    await deleteCustomerAddress(id);
    setBusy(false);
    router.refresh();
  }
  async function onSetDefault(id: number, type: "billing" | "shipping") {
    setBusy(true);
    await setDefaultAddress(id, type);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {addresses.length === 0 && editing === null && (
        <p className="text-sm text-text-secondary">No saved addresses yet.</p>
      )}

      {addresses.map((a) =>
        editing === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            googlePlacesEnabled={googlePlacesEnabled}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : (
          <div key={a.id} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                <p className="font-medium text-ink-900">
                  {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                  {a.company ? ` · ${a.company}` : ""}
                </p>
                <p className="text-steel-500">
                  {[a.address1, a.address2, a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.isDefaultBilling && <span className="badge-member">Default billing</span>}
                  {a.isDefaultShipping && <span className="badge-stock-in">Default shipping</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => setEditing(a.id)} aria-label="Edit" className="p-2 text-steel-400 hover:text-accent">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(a.id)} disabled={busy} aria-label="Delete" className="p-2 text-steel-400 hover:text-sale disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {!a.isDefaultBilling && (
                <button onClick={() => onSetDefault(a.id, "billing")} disabled={busy} className="font-semibold text-accent hover:text-accent-hover disabled:opacity-50">
                  Set as default billing
                </button>
              )}
              {!a.isDefaultShipping && (
                <button onClick={() => onSetDefault(a.id, "shipping")} disabled={busy} className="font-semibold text-accent hover:text-accent-hover disabled:opacity-50">
                  Set as default shipping
                </button>
              )}
            </div>
          </div>
        )
      )}

      {editing === "new" ? (
        <AddressForm
          googlePlacesEnabled={googlePlacesEnabled}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : (
        <button onClick={() => setEditing("new")} className="btn-secondary btn-sm">
          <Plus className="h-3.5 w-3.5" /> Add address
        </button>
      )}
    </div>
  );
}

function AddressForm({
  initial,
  googlePlacesEnabled,
  onCancel,
  onSaved,
}: {
  initial?: Address;
  googlePlacesEnabled?: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  // State and postcode are controlled — the address book stores AU addresses
  // only, and these are the two fields that decide whether an order can be
  // priced for freight. A legacy row's junk value normalises to "" so the
  // required dropdown forces the member to pick a real state before saving.
  const [stateValue, setStateValue] = useState(
    () => normaliseAuState(initial?.state) ?? ""
  );
  const [postalCodeValue, setPostalCodeValue] = useState(() =>
    (initial?.postalCode ?? "").replace(/\D/g, "").slice(0, 4)
  );

  function handlePlaceSelect(place: { address1: string; city: string; state: string; postalCode: string }) {
    if (address1Ref.current) address1Ref.current.value = place.address1;
    if (cityRef.current) cityRef.current.value = place.city;
    // Places returns "VIC" or "Victoria" — normalise so the dropdown matches.
    setStateValue(normaliseAuState(place.state) ?? "");
    setPostalCodeValue(place.postalCode.replace(/\D/g, "").slice(0, 4));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input: AddressInput = {
      firstName: (fd.get("firstName") as string) || "",
      lastName: (fd.get("lastName") as string) || "",
      company: (fd.get("company") as string) || "",
      phone: (fd.get("phone") as string) || "",
      address1: (fd.get("address1") as string) || "",
      address2: (fd.get("address2") as string) || "",
      city: (fd.get("city") as string) || "",
      state: (fd.get("state") as string) || "",
      postalCode: (fd.get("postalCode") as string) || "",
      isDefaultBilling: fd.get("isDefaultBilling") === "on",
      isDefaultShipping: fd.get("isDefaultShipping") === "on",
    };
    const result = initial
      ? await updateCustomerAddress(initial.id, input)
      : await createCustomerAddress(input);
    setSaving(false);
    if (!result.success) {
      setError(result.error || "Failed to save");
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="border border-accent/30 rounded-lg p-4 space-y-4 bg-steel-50">
      {error && <div className="bg-sale-bg border border-sale/30 text-sale-deep p-3 text-sm rounded-lg">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label">First name</label>
          <input name="firstName" type="text" defaultValue={initial?.firstName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Last name</label>
          <input name="lastName" type="text" defaultValue={initial?.lastName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Company</label>
          <input name="company" type="text" defaultValue={initial?.company} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Phone</label>
          <input name="phone" type="tel" defaultValue={initial?.phone} className="mt-1 block w-full input" />
        </div>
      </div>
      <div className="relative">
        <label className="field-label">Address</label>
        <input ref={address1Ref} name="address1" type="text" required autoComplete="off" defaultValue={initial?.address1} className="mt-1 block w-full input" />
        {googlePlacesEnabled && <AddressAutocomplete inputRef={address1Ref} onSelect={handlePlaceSelect} />}
      </div>
      <div>
        <label className="field-label">Apartment, suite, etc. (optional)</label>
        <input name="address2" type="text" defaultValue={initial?.address2} className="mt-1 block w-full input" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">City / suburb</label>
          <input ref={cityRef} name="city" type="text" required defaultValue={initial?.city} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">State / Territory</label>
          <select
            name="state"
            required
            value={stateValue}
            onChange={(e) => setStateValue(e.target.value)}
            className="mt-1 block w-full input bg-white"
          >
            <option value="">Select a state…</option>
            {AU_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Postcode</label>
          <input
            name="postalCode"
            type="text"
            required
            value={postalCodeValue}
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            title="Australian postcodes are 4 digits, e.g. 3140"
            placeholder="e.g. 3140"
            // 4 digits, enforced at the keystroke: a junk postcode here ends up
            // on an order at checkout, where it matches no shipping zone.
            onChange={(e) => setPostalCodeValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="mt-1 block w-full input"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefaultBilling" defaultChecked={initial?.isDefaultBilling} className="accent-[#00786F]" />
          Default billing
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefaultShipping" defaultChecked={initial?.isDefaultShipping} className="accent-[#00786F]" />
          Default shipping
        </label>
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary btn-sm disabled:opacity-50">
          {saving ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
      </div>
    </form>
  );
}
