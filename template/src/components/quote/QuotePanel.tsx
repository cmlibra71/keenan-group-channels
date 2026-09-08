"use client";

import { useEffect, useState, useTransition, useActionState, useCallback, useRef } from "react";
import Link from "next/link";
import { FileText, CheckCircle, User } from "lucide-react";
import {
  canSaveQuoteAddress,
  getQuote,
  getQuoteDeliveryAddresses,
  submitQuote,
} from "@/lib/actions/quote";
import { loginFromPanel, registerFromPanel, getRememberedEmail } from "@/lib/actions/account-panel";
import { forgetThisDevice } from "@/lib/actions/auth";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";
import { AddressAutocomplete } from "@/components/checkout/AddressAutocomplete";
import { Price } from "@/components/ui/Price";
import { QuoteItemsList, type QuoteItemRow } from "./QuoteItemsList";
import { usePanelContext } from "@/components/ui/PanelContext";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import {
  AU_STATES,
  EMPTY_QUOTE_REQUEST_ADDRESS,
  QUOTE_NAME_MAX_LENGTH,
  QUOTE_REQUEST_PROBLEM_MESSAGE,
  mayFileQuoteAddressInBook,
  normaliseAuState,
  quoteAddressCountryCode,
  savedAddressLabel,
  validateQuoteRequest,
  type QuoteRequestAddressFields,
  type SavedQuoteAddress,
} from "@/lib/quotes/quote-request";

type QuoteData = Awaited<ReturnType<typeof getQuote>>;

type SessionInfo = {
  contactId: number;
  email: string;
  firstName: string;
  lastName: string;
};

export function QuotePanel() {
  const { isOpen, close } = usePanelContext();
  const [quote, setQuote] = useState<QuoteData>(null);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // The three things Zoey's own form asks for beyond the items (card 9tbz3sBF).
  const [quoteName, setQuoteName] = useState("");
  const [comments, setComments] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<SavedQuoteAddress[]>([]);
  // Whether this customer's typed address will actually be FILED for next time. A
  // B2B role can forbid it (the checkout's own gate), and we must not print the
  // promise to someone we then silently skip.
  const [canSaveAddress, setCanSaveAddress] = useState(false);
  const [addressId, setAddressId] = useState<number | "new">("new");
  const [newAddress, setNewAddress] = useState<QuoteRequestAddressFields>(
    EMPTY_QUOTE_REQUEST_ADDRESS
  );
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  // Card upTMAqRc — the address this browser last signed in with, so a returning
  // customer meets a filled-in email here too and types only their password.
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  const { setQuoteCount } = useCartQuoteCounts();
  // The autocomplete attaches to the street input rather than owning it, so the
  // customer can still type an address Google has never heard of.
  const streetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setQuoteName("");
      setComments("");
      setNewAddress(EMPTY_QUOTE_REQUEST_ADDRESS);
      setError(null);
      setNeedsLogin(false);
      setAuthView("login");
      startTransition(async () => {
        const [data, addresses, maySave, remembered] = await Promise.all([
          getQuote(),
          getQuoteDeliveryAddresses(),
          canSaveQuoteAddress(),
          getRememberedEmail(),
        ]);
        setQuote(data);
        applyAddresses(addresses);
        setCanSaveAddress(maySave);
        setRememberedEmail(remembered);
      });
    }
  }, [isOpen]);

  /** Default to the customer's first saved address, Zoey-style; otherwise "new". */
  function applyAddresses(addresses: SavedQuoteAddress[]) {
    setSavedAddresses(addresses);
    setAddressId(addresses[0]?.id ?? "new");
  }

  const refreshQuote = useCallback(() => {
    startTransition(async () => {
      const data = await getQuote();
      setQuote(data);
    });
  }, []);

  const items = (quote?.items ?? []) as unknown as QuoteItemRow[];
  const subtotal = parseFloat(((quote as Record<string, unknown> | null)?.base_amount as string | undefined) ?? "0");
  // Lines without a price are quoted by the sales team — reflect that in the
  // footer instead of implying they cost $0.
  const poaCount = items.filter((i) => {
    const unit = parseFloat(i.sale_price ?? i.list_price ?? "");
    return !Number.isFinite(unit) || unit <= 0;
  }).length;
  const allPoa = items.length > 0 && poaCount === items.length;

  const requestForm = { quoteName, comments, addressId, newAddress };
  // Australia unless Google's autocomplete said otherwise (IK sells into NZ). Decides
  // both the State control and whether the address book will take this address.
  const isAuAddress = quoteAddressCountryCode(newAddress) === "AU";
  const willSaveAddress = canSaveAddress && mayFileQuoteAddressInBook(newAddress);

  /** Send the request. The server applies the SAME rules, so this is courtesy, not the gate. */
  function doSubmit() {
    const problem = validateQuoteRequest(requestForm, savedAddresses);
    if (problem) {
      setError(QUOTE_REQUEST_PROBLEM_MESSAGE[problem]);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    startTransition(async () => {
      const result = await submitQuote(requestForm);
      if (result.error === "login_required") {
        setNeedsLogin(true);
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      // A refusal (a role that may not submit, a stale address) says so and leaves the
      // form as it is. Reporting "Quote Submitted" over a failed write is how a request
      // disappears without anybody noticing.
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      setQuote(null);
      // Badge zeroes instantly; the kept server refresh() re-seeds it identically.
      setQuoteCount(0);
    });
  }

  function handleAuthSuccess(_session: SessionInfo) {
    // Signing in from the panel means the customer's address book is only now
    // readable, so it is loaded before the retry: a customer who typed an address
    // while signed out keeps it (their pick is "new"), and one who has saved
    // addresses is shown them rather than silently quoted to a typed duplicate.
    setNeedsLogin(false);
    setIsSubmitting(true);
    startTransition(async () => {
      const [addresses, maySave] = await Promise.all([
        getQuoteDeliveryAddresses(),
        canSaveQuoteAddress(),
      ]);
      setSavedAddresses(addresses);
      setCanSaveAddress(maySave);
      const problem = validateQuoteRequest(requestForm, addresses);
      if (problem) {
        setIsSubmitting(false);
        setAddressId(addresses[0]?.id ?? "new");
        setError(QUOTE_REQUEST_PROBLEM_MESSAGE[problem]);
        return;
      }
      const result = await submitQuote(requestForm);
      if (result.error) {
        setIsSubmitting(false);
        setError(result.error === "login_required" ? "Please sign in again." : result.error);
        return;
      }
      setIsSubmitting(false);
      setSubmitted(true);
      setQuote(null);
      setQuoteCount(0);
    });
  }

  if (isPending && !needsLogin && !isSubmitting) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <CheckCircle className="h-16 w-16 text-green-500" />
        <p className="mt-4 text-lg font-semibold text-zinc-900">Quote Submitted</p>
        <p className="mt-2 text-sm text-zinc-500 text-center">
          Our sales team will review your quote and get back to you shortly. You can track your quotes in My Account.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={close}
            className="inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors text-sm"
          >
            Continue Shopping
          </button>
          <Link
            href="/account/quotes"
            onClick={close}
            className="inline-block border border-zinc-300 text-zinc-700 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-50 transition-colors text-sm"
          >
            View My Quotes
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0 && !needsLogin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <FileText className="h-16 w-16 text-zinc-300" />
        <p className="mt-4 text-zinc-500">Your quote is empty.</p>
        <button
          onClick={close}
          className="mt-6 inline-block bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors text-sm"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  if (needsLogin) {
    if (authView === "register") {
      return (
        <QuotePanelRegister
          onSuccess={handleAuthSuccess}
          onSwitchToLogin={() => setAuthView("login")}
        />
      );
    }
    return (
      <QuotePanelLogin
        defaultEmail={rememberedEmail ?? undefined}
        rememberedDevice={!!rememberedEmail}
        onForgetDevice={() => setRememberedEmail(null)}
        onSuccess={handleAuthSuccess}
        onSwitchToRegister={() => setAuthView("register")}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <QuoteItemsList items={items} onMutate={refreshQuote} />

        {/* Quote Name — compulsory, and it is what the customer sees this quote
            called in My Account (Steve, card 9tbz3sBF). */}
        <div className="mt-6">
          <label htmlFor="quote-name" className="block text-sm font-medium text-zinc-700">
            Quote name <span className="text-red-600">*</span>
          </label>
          <input
            id="quote-name"
            type="text"
            value={quoteName}
            maxLength={QUOTE_NAME_MAX_LENGTH}
            onChange={(e) => setQuoteName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="e.g. Kitchen fit-out — Smith St"
          />
          <p className="mt-1 text-xs text-zinc-500">
            You&apos;ll see this name against the quote in My Account.
          </p>
        </div>

        {/* Quote Comments — the customer's own words. Our team keeps its own,
            separate internal note, which the customer never sees. */}
        <div className="mt-4">
          <label htmlFor="quote-comments" className="block text-sm font-medium text-zinc-700">
            Quote comments
          </label>
          <textarea
            id="quote-comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="Any special requirements or questions..."
          />
        </div>

        {/* Delivery address — REQUIRED at quote stage (Steve, 2026-07-28). Pick a
            saved one or type a new one, which we keep for next time. No billing
            address is asked for at this stage. */}
        <div className="mt-4">
          <label htmlFor="quote-address" className="block text-sm font-medium text-zinc-700">
            Delivery address <span className="text-red-600">*</span>
          </label>
          <select
            id="quote-address"
            value={addressId === "new" ? "new" : String(addressId)}
            onChange={(e) =>
              setAddressId(e.target.value === "new" ? "new" : Number(e.target.value))
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            {savedAddresses.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {savedAddressLabel(a)}
              </option>
            ))}
            <option value="new">Enter a new address…</option>
          </select>

          {addressId === "new" && (
            <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newAddress.firstName}
                  onChange={(e) => setNewAddress({ ...newAddress, firstName: e.target.value })}
                  placeholder="First name"
                  autoComplete="given-name"
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={newAddress.lastName}
                  onChange={(e) => setNewAddress({ ...newAddress, lastName: e.target.value })}
                  placeholder="Last name"
                  autoComplete="family-name"
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={newAddress.company}
                onChange={(e) => setNewAddress({ ...newAddress, company: e.target.value })}
                placeholder="Business name (optional)"
                autoComplete="organization"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <input
                type="tel"
                value={newAddress.phone}
                onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                placeholder="Phone for the driver (optional)"
                autoComplete="tel"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <div className="relative">
                <input
                  ref={streetRef}
                  type="text"
                  value={newAddress.address1}
                  onChange={(e) => setNewAddress({ ...newAddress, address1: e.target.value })}
                  placeholder="Street address *"
                  autoComplete="address-line1"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
                <AddressAutocomplete
                  inputRef={streetRef}
                  onSelect={(a) => {
                    const code = (a.countryCode || "AU").toUpperCase();
                    setNewAddress((prev) => ({
                      ...prev,
                      address1: a.address1,
                      city: a.city,
                      // Google hands back "Victoria" as often as "VIC"; the State
                      // control only speaks codes, so normalise on the way in rather
                      // than leaving the picker showing nothing selected.
                      state: (code === "AU" ? normaliseAuState(a.state) : null) ?? a.state,
                      postalCode: a.postalCode,
                      countryCode: code,
                    }));
                  }}
                />
              </div>
              <input
                type="text"
                value={newAddress.address2}
                onChange={(e) => setNewAddress({ ...newAddress, address2: e.target.value })}
                placeholder="Unit / level (optional)"
                autoComplete="address-line2"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newAddress.city}
                  onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                  placeholder="Suburb *"
                  autoComplete="address-level2"
                  className="col-span-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
                {/* An Australian state is PICKED, never typed: a free-text state
                    ("Victoria", which is what Zoey's own form shows) matches no
                    shipping zone and used to be billed as $0 delivery. Same list and
                    same rule as the checkout (cards 18PbOwaG / xqWftDcL). Only a
                    non-AU address — Google's autocomplete on a NZ street — keeps the
                    free-text box, because we have no region list for anywhere else. */}
                {isAuAddress ? (
                  <select
                    value={newAddress.state}
                    onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                    autoComplete="address-level1"
                    aria-label="State"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="">State *</option>
                    {AU_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newAddress.state}
                    onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                    placeholder="Region *"
                    autoComplete="address-level1"
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                )}
              </div>
              <input
                type="text"
                value={newAddress.postalCode}
                onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                placeholder="Postcode *"
                autoComplete="postal-code"
                inputMode={isAuAddress ? "numeric" : "text"}
                maxLength={isAuAddress ? 4 : undefined}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              {/* Only promised when it is actually true: the address book is AU only,
                  and a B2B role can forbid adding an address at all. */}
              {willSaveAddress && (
                <p className="text-xs text-zinc-500">
                  We&apos;ll save this address to your account for next time.
                </p>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            Once you send this request the details are locked in — call or email us if
            anything needs to change.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-600">Estimated Total</span>
          {allPoa ? (
            <span className="font-semibold text-zinc-900">To be quoted</span>
          ) : (
            <Price amount={subtotal} className="font-semibold text-zinc-900" />
          )}
        </div>
        {poaCount > 0 && !allPoa && (
          <p className="text-xs text-zinc-500">
            + {poaCount} item{poaCount !== 1 ? "s" : ""} to be quoted by our sales team
          </p>
        )}
        {allPoa && (
          <p className="text-xs text-zinc-500">
            Our sales team will price {poaCount !== 1 ? "these items" : "this item"} and get back to you.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={close}
            className="text-center border border-zinc-300 text-zinc-700 py-2.5 px-4 rounded-lg font-semibold hover:bg-zinc-50 transition-colors text-sm"
          >
            Continue Shopping
          </button>
          <button
            onClick={doSubmit}
            disabled={isSubmitting}
            className="text-center bg-zinc-900 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors text-sm disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Submitting..." : "Submit Quote"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuotePanelLogin({
  defaultEmail,
  rememberedDevice = false,
  onForgetDevice,
  onSuccess,
  onSwitchToRegister,
}: {
  /** The known-device address, when this browser has signed in here before. */
  defaultEmail?: string;
  rememberedDevice?: boolean;
  onForgetDevice?: () => void;
  onSuccess: (info: SessionInfo) => void;
  onSwitchToRegister: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [knownDevice, setKnownDevice] = useState(rememberedDevice);
  const [, startForgetting] = useTransition();

  function forgetDevice() {
    setKnownDevice(false);
    setEmail("");
    onForgetDevice?.();
    startForgetting(async () => {
      await forgetThisDevice();
    });
  }

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await loginFromPanel(formData);
      if (result.error) return { error: result.error };
      onSuccess(result.session!);
      return null;
    },
    null
  );

  return (
    <div className="px-6 py-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-zinc-300 mx-auto" />
        <p className="mt-2 text-zinc-500">
          {knownDevice
            ? "Welcome back. Enter your password to submit your quote."
            : "Sign in to submit your quote"}
        </p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-zinc-400">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="quote-login-email" className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            id="quote-login-email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
          {knownDevice && (
            <p className="mt-1">
              <button
                type="button"
                onClick={forgetDevice}
                className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline"
              >
                Not you? Use a different email
              </button>
            </p>
          )}
        </div>
        <div>
          <label htmlFor="quote-login-password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="quote-login-password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus={knownDevice}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-right">
            <Link href="/account/forgot-password" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 text-sm"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        Don&apos;t have an account?{" "}
        <button
          onClick={onSwitchToRegister}
          className="text-zinc-900 font-medium hover:underline"
        >
          Create one
        </button>
      </p>
    </div>
  );
}

function QuotePanelRegister({
  onSuccess,
  onSwitchToLogin,
}: {
  onSuccess: (info: SessionInfo) => void;
  onSwitchToLogin: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await registerFromPanel(formData);
      if (result.error) return { error: result.error };
      onSuccess(result.session!);
      return null;
    },
    null
  );

  return (
    <div className="px-6 py-8">
      <div className="text-center mb-6">
        <User className="h-12 w-12 text-zinc-300 mx-auto" />
        <p className="mt-2 text-zinc-500">Create an account to submit your quote</p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-zinc-400">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quote-reg-firstName" className="block text-sm font-medium text-zinc-700">
              First Name
            </label>
            <input
              type="text"
              id="quote-reg-firstName"
              name="firstName"
              autoComplete="given-name"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="quote-reg-lastName" className="block text-sm font-medium text-zinc-700">
              Last Name
            </label>
            <input
              type="text"
              id="quote-reg-lastName"
              name="lastName"
              autoComplete="family-name"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor="quote-reg-email" className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            id="quote-reg-email"
            name="email"
            autoComplete="username"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="quote-reg-password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="quote-reg-password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-zinc-900 text-white py-2 px-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors disabled:bg-zinc-300 text-sm"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <button
          onClick={onSwitchToLogin}
          className="text-zinc-900 font-medium hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
