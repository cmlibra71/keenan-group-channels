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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6">
        <CheckCircle className="h-16 w-16 text-accent" strokeWidth={1.5} />
        <p className="mt-4 text-lg font-semibold text-text-primary">Quote Submitted</p>
        <p className="mt-2 body-text text-center">
          Our sales team will review your quote and get back to you shortly. You can track your quotes in My Account.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={close}
            className="btn-primary"
          >
            Continue Shopping
          </button>
          <Link
            href="/account/quotes"
            onClick={close}
            className="btn-secondary"
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
        <FileText className="h-16 w-16 text-text-muted" strokeWidth={1.5} />
        <p className="mt-4 text-text-secondary">Your quote is empty.</p>
        <button
          onClick={close}
          className="btn-primary mt-6"
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
          <label htmlFor="quote-notes" className="field-label">
            Notes for sales team (optional)
          </label>
          <textarea
            id="quote-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full input focus:ring-1 focus:ring-text-primary"
            placeholder="Any special requirements or questions..."
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 py-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-secondary">Estimated Total</span>
          <Price amount={subtotal} className="font-semibold text-text-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={close}
            className="btn-secondary text-center"
          >
            Continue Shopping
          </button>
          <button
            onClick={doSubmit}
            disabled={isSubmitting}
            className="btn-primary text-center"
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
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">Sign in to submit your quote</p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-text-muted">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="quote-login-email" className="field-label">
            Email
          </label>
          <input
            type="email"
            id="quote-login-email"
            name="email"
            required
            className="mt-1 block w-full input"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="quote-login-password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="quote-login-password"
            name="password"
            required
            className="mt-1 block w-full input"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        Don&apos;t have an account?{" "}
        <button
          onClick={onSwitchToRegister}
          className="text-text-primary font-medium hover:underline"
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
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">Create an account to submit your quote</p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-text-muted">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 alert-error">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="quote-reg-firstName" className="field-label">
              First Name
            </label>
            <input
              type="text"
              id="quote-reg-firstName"
              name="firstName"
              required
              className="mt-1 block w-full input"
            />
          </div>
          <div>
            <label htmlFor="quote-reg-lastName" className="field-label">
              Last Name
            </label>
            <input
              type="text"
              id="quote-reg-lastName"
              name="lastName"
              required
              className="mt-1 block w-full input"
            />
          </div>
        </div>
        <div>
          <label htmlFor="quote-reg-email" className="field-label">
            Email
          </label>
          <input
            type="email"
            id="quote-reg-email"
            name="email"
            required
            className="mt-1 block w-full input"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="quote-reg-password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="quote-reg-password"
            name="password"
            required
            minLength={8}
            className="mt-1 block w-full input"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary w-full"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center body-text">
        Already have an account?{" "}
        <button
          onClick={onSwitchToLogin}
          className="text-text-primary font-medium hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
