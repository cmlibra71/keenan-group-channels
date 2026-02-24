"use client";

import { useEffect, useState, useTransition, useActionState, useCallback } from "react";
import Link from "next/link";
import { FileText, CheckCircle, User } from "lucide-react";
import { getQuote, submitQuote } from "@/lib/actions/quote";
import { loginFromPanel, registerFromPanel } from "@/lib/actions/account-panel";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";
import { Price } from "@/components/ui/Price";
import { QuoteItemsList } from "./QuoteItemsList";
import { usePanelContext } from "@/components/ui/PanelContext";

type QuoteData = Awaited<ReturnType<typeof getQuote>>;

type SessionInfo = {
  customerId: number;
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
  const [notes, setNotes] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authView, setAuthView] = useState<"login" | "register">("login");

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setNotes("");
      setNeedsLogin(false);
      setAuthView("login");
      startTransition(async () => {
        const data = await getQuote();
        setQuote(data);
      });
    }
  }, [isOpen]);

  const refreshQuote = useCallback(() => {
    startTransition(async () => {
      const data = await getQuote();
      setQuote(data);
    });
  }, []);

  const items = quote?.items ?? [];
  const subtotal = parseFloat(quote?.baseAmount ?? "0");

  function doSubmit() {
    setIsSubmitting(true);
    startTransition(async () => {
      const result = await submitQuote(notes || undefined);
      if (result.error === "login_required") {
        setNeedsLogin(true);
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      setSubmitted(true);
      setQuote(null);
    });
  }

  function handleAuthSuccess(_session: SessionInfo) {
    // After successful auth, auto-retry submission
    setNeedsLogin(false);
    setIsSubmitting(true);
    startTransition(async () => {
      const result = await submitQuote(notes || undefined);
      if (result.error) {
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      setSubmitted(true);
      setQuote(null);
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
        onSuccess={handleAuthSuccess}
        onSwitchToRegister={() => setAuthView("register")}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <QuoteItemsList items={items} onMutate={refreshQuote} />

        {/* Customer notes */}
        <div className="mt-6">
          <label htmlFor="quote-notes" className="block text-sm font-medium text-zinc-700">
            Notes for sales team (optional)
          </label>
          <textarea
            id="quote-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="Any special requirements or questions..."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-200 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-600">Estimated Total</span>
          <Price amount={subtotal} className="font-semibold text-zinc-900" />
        </div>
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
  onSuccess,
  onSwitchToRegister,
}: {
  onSuccess: (info: SessionInfo) => void;
  onSwitchToRegister: () => void;
}) {
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
        <p className="mt-2 text-zinc-500">Sign in to submit your quote</p>
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
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="quote-login-password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="quote-login-password"
            name="password"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
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
