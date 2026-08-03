"use client";

import { useState, useRef } from "react";
import { completeMembershipProfile } from "@/lib/actions/subscription";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { AU_STATES, normaliseAuState } from "@/lib/checkout/au-address";

export function CompleteProfileForm({
  defaultCompany = "",
  defaultPhone = "",
  googlePlacesEnabled = false,
}: {
  defaultCompany?: string;
  defaultPhone?: string;
  googlePlacesEnabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address1Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  // This form writes the member's DEFAULT BILLING address, which is offered at
  // checkout — so state and postcode follow the same Australian rules as the
  // checkout form: a fixed list of 8, and exactly 4 digits.
  const [stateValue, setStateValue] = useState("");
  const [postalCodeValue, setPostalCodeValue] = useState("");

  function handlePlaceSelect(place: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
  }) {
    if (address1Ref.current) address1Ref.current.value = place.address1;
    if (cityRef.current) cityRef.current.value = place.city;
    // Places returns "VIC" or "Victoria" — normalise so the dropdown matches.
    setStateValue(normaliseAuState(place.state) ?? "");
    setPostalCodeValue(place.postalCode.replace(/\D/g, "").slice(0, 4));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    // On success the action redirects server-side to /membership/welcome and
    // never returns; only an error case returns a result here.
    const result = await completeMembershipProfile({
      company: (fd.get("company") as string) || "",
      phone: (fd.get("phone") as string) || "",
      address1: (fd.get("address1") as string) || "",
      address2: (fd.get("address2") as string) || "",
      city: (fd.get("city") as string) || "",
      state: (fd.get("state") as string) || "",
      postalCode: (fd.get("postalCode") as string) || "",
    });
    if (result && !result.success) {
      setError(result.error || "Failed to save details");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-sale-bg border border-sale/30 text-sale-deep p-4 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className="field-label">Business / company name</label>
          <input id="company" name="company" type="text" required defaultValue={defaultCompany} className="mt-1 block w-full input" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">Phone</label>
          <input id="phone" name="phone" type="tel" required defaultValue={defaultPhone} className="mt-1 block w-full input" />
        </div>
      </div>

      <div className="relative">
        <label htmlFor="address1" className="field-label">Billing address</label>
        <input ref={address1Ref} id="address1" name="address1" type="text" required autoComplete="off" className="mt-1 block w-full input" />
        {googlePlacesEnabled && (
          <AddressAutocomplete inputRef={address1Ref} onSelect={handlePlaceSelect} />
        )}
      </div>

      <div>
        <label htmlFor="address2" className="field-label">Apartment, suite, etc. (optional)</label>
        <input id="address2" name="address2" type="text" className="mt-1 block w-full input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="city" className="field-label">City / suburb</label>
          <input ref={cityRef} id="city" name="city" type="text" required className="mt-1 block w-full input" />
        </div>
        <div>
          <label htmlFor="state" className="field-label">State / Territory</label>
          <select
            id="state"
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
          <label htmlFor="postalCode" className="field-label">Postcode</label>
          <input
            id="postalCode"
            name="postalCode"
            type="text"
            required
            value={postalCodeValue}
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            title="Australian postcodes are 4 digits, e.g. 3140"
            placeholder="e.g. 3140"
            onChange={(e) => setPostalCodeValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="mt-1 block w-full input"
          />
        </div>
      </div>

      <p className="text-xs text-text-secondary">
        We ship across Australia only. These details appear on your invoices and
        speed up checkout.
      </p>

      <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? "Saving…" : "Save & finish"}
      </button>
    </form>
  );
}
