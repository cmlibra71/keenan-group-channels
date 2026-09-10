"use client";

import { useState } from "react";
import { PASSWORD_POLICY_HINT } from "@keenan/services/password-policy";
import { AU_STATES } from "@/lib/checkout/au-address";
import {
  ACTIVATION_STEP_TITLES,
  formatAddressLine,
  validateAccountStep,
  validateAddressStep,
  type ActivationAddress,
  type ActivationStep,
} from "@/lib/membership/activation";
import { activateMembership } from "@/lib/actions/membership-activation";

/**
 * The three numbered steps of Tim's storyboard — Account details, Address details, Membership
 * details — walked in the browser and posted ONCE.
 *
 * Stepping is client-side on purpose. The token is single-use, so consuming it at step 1 would
 * strand anybody who closed the tab at step 2; one submit at the end means one consume, on an
 * explicit action. The step validators are the same pure functions the server re-runs, so what
 * this form accepts is exactly what the action accepts.
 *
 * Deliberately NOT copied from Myer: its password rule (8 characters, an uppercase, a lowercase
 * and a number). This site has ONE password rule, shared with register / reset / change and with
 * the portal, and it is the one quoted under the box.
 */
export function ActivateMembershipForm({
  token,
  email,
  firstName: initialFirstName,
  lastName: initialLastName,
  phone: initialPhone,
  dateOfBirth: initialDob,
  address: initialAddress,
}: {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  address: ActivationAddress | null;
}) {
  const [step, setStep] = useState<ActivationStep>("account");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [address1, setAddress1] = useState(initialAddress?.address1 ?? "");
  const [address2, setAddress2] = useState(initialAddress?.address2 ?? "");
  const [city, setCity] = useState(initialAddress?.city ?? "");
  const [state, setState] = useState(initialAddress?.state ?? "");
  const [postalCode, setPostalCode] = useState(initialAddress?.postalCode ?? "");

  const [dateOfBirth, setDateOfBirth] = useState(initialDob);

  const addressLine = formatAddressLine({ address1, address2, city, state, postalCode });

  function continueFromAccount() {
    const err = validateAccountStep({
      firstName,
      lastName,
      phone,
      password,
      confirmPassword,
      hasPassword: false,
    });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep("address");
  }

  function continueFromAddress() {
    const result = validateAddressStep({ address1, address2, city, state, postalCode });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setStep("membership");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // On success the action redirects and never returns, so anything that comes back is an error.
    const result = await activateMembership({
      token,
      firstName,
      lastName,
      phone,
      password,
      confirmPassword,
      address1,
      address2,
      city,
      state,
      postalCode,
      dateOfBirth,
    });
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  const label = "block text-sm font-medium text-ink-700";
  const field =
    "mt-1 block w-full rounded-lg border border-steel-300 px-3 py-2 text-sm focus:border-steel-500 focus:outline-none";
  const primary =
    "w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-deep disabled:opacity-50";

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-sale/30 bg-sale-bg p-4 text-sm text-sale-deep">
          {error}
        </div>
      )}

      {/* 1. Account details */}
      <section className="border-b border-steel-200 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">
            1. {ACTIVATION_STEP_TITLES.account}
          </h2>
          {step !== "account" && (
            <button
              type="button"
              onClick={() => setStep("account")}
              className="text-sm font-medium text-ink-700 underline hover:no-underline"
            >
              Edit
            </button>
          )}
        </div>

        {step === "account" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className={label}>
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="lastName" className={label}>
                  Last name
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className={field}
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className={label}>
                Mobile number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className={field}
              />
            </div>

            <div>
              <label htmlFor="email" className={label}>
                Email address
              </label>
              {/* Read-only on purpose: customers cannot change the email on their own account
                  (card eUKgHCrc), and this one is the address the link was sent to. */}
              <input
                id="email"
                value={email}
                readOnly
                className={`${field} bg-steel-50 text-steel-500`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className={label}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={label}>
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={field}
                />
              </div>
            </div>
            <p className="text-xs text-steel-500">{PASSWORD_POLICY_HINT}</p>

            <button type="button" onClick={continueFromAccount} className={primary}>
              Continue
            </button>
          </div>
        )}
      </section>

      {/* 2. Address details */}
      <section className="border-b border-steel-200 pb-6">
        <div className="flex items-center justify-between">
          <h2
            className={`text-lg font-semibold ${
              step === "account" ? "text-steel-400" : "text-ink-900"
            }`}
          >
            2. {ACTIVATION_STEP_TITLES.address}
          </h2>
          {step === "membership" && (
            <button
              type="button"
              onClick={() => setStep("address")}
              className="text-sm font-medium text-ink-700 underline hover:no-underline"
            >
              Edit
            </button>
          )}
        </div>

        {step === "membership" && addressLine && (
          <p className="mt-2 text-sm text-text-secondary">{addressLine}</p>
        )}

        {step === "address" && (
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="address1" className={label}>
                Street address
              </label>
              <input
                id="address1"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                autoComplete="address-line1"
                className={field}
              />
            </div>
            <div>
              <label htmlFor="address2" className={label}>
                Apartment, suite, etc. (optional)
              </label>
              <input
                id="address2"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                autoComplete="address-line2"
                className={field}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="city" className={label}>
                  Suburb
                </label>
                <input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  className={field}
                />
              </div>
              <div>
                <label htmlFor="state" className={label}>
                  State
                </label>
                {/* The same fixed list of 8 the checkout uses — this becomes the member's default
                    billing address, and a free-text state matches no freight zone. */}
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={`${field} bg-white`}
                >
                  <option value="">Select…</option>
                  {AU_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="postalCode" className={label}>
                  Postcode
                </label>
                <input
                  id="postalCode"
                  value={postalCode}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className={field}
                />
              </div>
            </div>

            <button type="button" onClick={continueFromAddress} className={primary}>
              Continue
            </button>
          </div>
        )}
      </section>

      {/* 3. Membership details */}
      <section>
        <h2
          className={`text-lg font-semibold ${
            step === "membership" ? "text-ink-900" : "text-steel-400"
          }`}
        >
          3. {ACTIVATION_STEP_TITLES.membership}
        </h2>

        {step === "membership" && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-text-secondary">
              Help us reward you on your birthday. This one is optional.
            </p>
            <div>
              <label htmlFor="dateOfBirth" className={label}>
                Date of birth (optional)
              </label>
              <input
                id="dateOfBirth"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                autoComplete="bday"
                className={field}
              />
            </div>

            <p className="text-xs text-steel-500">
              Activating your account takes you to the last step, where you confirm your membership
              and enter a card. Nothing has been charged yet, and you can cancel any time.
            </p>

            <button type="submit" disabled={submitting} className={primary}>
              {submitting ? "Activating…" : "Activate account"}
            </button>
          </div>
        )}
      </section>
    </form>
  );
}
