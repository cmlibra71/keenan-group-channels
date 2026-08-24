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
import { addressBookNoticeLines } from "@/lib/account/address-authority";

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

/**
 * The details the customer already gave us on the Profile card above, offered
 * as the starting point for a NEW address (card xqWftDcL: "ability to copy
 * available details from previous panel to prevent re-entry fatigue").
 * Every field stays editable, and an address being EDITED keeps its own values.
 */
export type AddressPrefill = {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
};

/**
 * `canAdd` / `canEdit` / `canRemove` come from the B2B account role (card
 * H5JdsMrC): on a business account only the manager may change what the account
 * has saved. Hiding a control is presentation only — every action re-checks the
 * role server-side — but a hidden control still needs its explanation, so the
 * read-only note takes the place of the ones we remove. Defaults are `true`, so a
 * B2C shopper and every existing caller behave exactly as before.
 */
export function AddressBook({
  addresses,
  googlePlacesEnabled = false,
  prefill,
  canAdd = true,
  canEdit = true,
  canRemove = true,
  canTypeAddressAtCheckout = true,
}: {
  addresses: Address[];
  googlePlacesEnabled?: boolean;
  prefill?: AddressPrefill;
  canAdd?: boolean;
  canEdit?: boolean;
  canRemove?: boolean;
  /** Would `placeOrder` accept an address they type at checkout? */
  canTypeAddressAtCheckout?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Printed whenever ANY of the three writes is refused, not only when all three
  // are: a role that may add but not edit would otherwise lose Edit, Delete and
  // Set-as-default with nothing on screen explaining where they went.
  const notice = addressBookNoticeLines({
    canAdd,
    canEdit,
    canRemove,
    hasSavedAddresses: addresses.length > 0,
    canTypeAddressAtCheckout,
  });

  async function onDelete(id: number) {
    setBusy(true);
    // The action answers with the reason when the role refuses. Swallowing it is
    // how a button comes to do nothing at all in front of a customer.
    const result = await deleteCustomerAddress(id);
    setBusy(false);
    if (!result.success) {
      setRefusal(result.error ?? "That address could not be removed.");
      return;
    }
    setRefusal(null);
    router.refresh();
  }
  async function onSetDefault(id: number, type: "billing" | "shipping") {
    setBusy(true);
    const result = await setDefaultAddress(id, type);
    setBusy(false);
    if (!result.success) {
      setRefusal(result.error ?? "That default could not be set.");
      return;
    }
    setRefusal(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div className="rounded-lg bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
          {notice.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>
            If one needs adding or changing, please{" "}
            <a href="/pages/contact" className="font-medium text-text-primary underline hover:no-underline">
              contact us
            </a>
            .
          </p>
        </div>
      )}

      {refusal && (
        <p role="alert" className="rounded-lg bg-sale-bg px-3 py-2 text-sm text-sale-deep">
          {refusal}
        </p>
      )}

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
                {canEdit && (
                  <button onClick={() => setEditing(a.id)} aria-label="Edit" className="p-2 text-steel-400 hover:text-accent">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {canRemove && (
                  <button onClick={() => onDelete(a.id)} disabled={busy} aria-label="Delete" className="p-2 text-steel-400 hover:text-sale disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {canEdit && !a.isDefaultBilling && (
                <button onClick={() => onSetDefault(a.id, "billing")} disabled={busy} className="font-semibold text-accent hover:text-accent-hover disabled:opacity-50">
                  Set as default billing
                </button>
              )}
              {canEdit && !a.isDefaultShipping && (
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
          prefill={prefill}
          googlePlacesEnabled={googlePlacesEnabled}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : (
        canAdd && (
          <button onClick={() => setEditing("new")} className="btn-secondary btn-sm">
            <Plus className="h-3.5 w-3.5" /> Add address
          </button>
        )
      )}
    </div>
  );
}

function AddressForm({
  initial,
  prefill,
  googlePlacesEnabled,
  onCancel,
  onSaved,
}: {
  initial?: Address;
  prefill?: AddressPrefill;
  googlePlacesEnabled?: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  // An address being EDITED shows its own values; only a NEW one starts from the
  // profile. The whole object is chosen, never merged field by field: an existing
  // address whose company the customer deliberately cleared must stay cleared,
  // not quietly re-acquire the profile's business name on the next edit.
  const start = initial ?? prefill;
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
          <input name="firstName" type="text" defaultValue={start?.firstName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Last name</label>
          <input name="lastName" type="text" defaultValue={start?.lastName} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Company</label>
          <input name="company" type="text" defaultValue={start?.company} className="mt-1 block w-full input" />
        </div>
        <div>
          <label className="field-label">Phone</label>
          <input name="phone" type="tel" defaultValue={start?.phone} className="mt-1 block w-full input" />
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
