"use client";

import { useEffect, useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { User, Package, FileText, LogOut } from "lucide-react";
import {
  getSessionInfo,
  loginFromPanel,
  registerFromPanel,
  logoutFromPanel,
} from "@/lib/actions/account-panel";
import { GoogleSignInButton } from "@/components/account/GoogleSignInButton";
import { usePanelContext } from "@/components/ui/PanelContext";

type SessionInfo = {
  customerId: number;
  email: string;
  firstName: string;
  lastName: string;
} | null;

type View = "login" | "register" | "profile";

export function AccountPanel() {
  const { isOpen } = usePanelContext();
  const [session, setSession] = useState<SessionInfo>(null);
  const [view, setView] = useState<View>("login");
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      startTransition(async () => {
        const info = await getSessionInfo();
        setSession(info);
        setView(info ? "profile" : "login");
        setLoaded(true);
      });
    }
  }, [isOpen]);

  if (!loaded || isPending) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone border-t-navy" />
      </div>
    );
  }

  if (view === "register") {
    return (
      <PanelRegisterForm
        onSuccess={(info) => {
          setSession(info);
          setView("profile");
        }}
        onSwitchToLogin={() => setView("login")}
      />
    );
  }

  if (view === "login" && !session) {
    return (
      <PanelLoginForm
        onSuccess={(info) => {
          setSession(info);
          setView("profile");
        }}
        onSwitchToRegister={() => setView("register")}
      />
    );
  }

  return (
    <PanelProfile
      session={session!}
      onLogout={() => {
        setSession(null);
        setView("login");
      }}
    />
  );
}

function PanelLoginForm({
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
        <User className="h-12 w-12 text-ink-faint mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-ink-light">Sign in to your account</p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-ink-faint">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="panel-email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            type="email"
            id="panel-email"
            name="email"
            required
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            type="password"
            id="panel-password"
            name="password"
            required
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-light">
        Don&apos;t have an account?{" "}
        <button
          onClick={onSwitchToRegister}
          className="text-navy font-medium hover:underline"
        >
          Create one
        </button>
      </p>
    </div>
  );
}

function PanelRegisterForm({
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
        <User className="h-12 w-12 text-ink-faint mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-ink-light">Create an account</p>
      </div>

      <GoogleSignInButton onSuccess={(session) => onSuccess(session)} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-ink-faint">or</span>
        </div>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="panel-firstName" className="block text-sm font-medium text-ink">
              First Name
            </label>
            <input
              type="text"
              id="panel-firstName"
              name="firstName"
              required
              className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="panel-lastName" className="block text-sm font-medium text-ink">
              Last Name
            </label>
            <input
              type="text"
              id="panel-lastName"
              name="lastName"
              required
              className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor="panel-reg-email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            type="email"
            id="panel-reg-email"
            name="email"
            required
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-reg-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            type="password"
            id="panel-reg-password"
            name="password"
            required
            minLength={8}
            className="mt-1 block w-full border border-stone px-3 py-2 text-sm focus:border-navy focus:outline-none"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-teal text-white px-7 py-3.5 font-medium text-sm tracking-wide hover:bg-teal-light transition-colors duration-300 disabled:bg-stone-warm disabled:text-ink-faint"
        >
          {isPending ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-ink-light">
        Already have an account?{" "}
        <button
          onClick={onSwitchToLogin}
          className="text-navy font-medium hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}

function PanelProfile({
  session,
  onLogout,
}: {
  session: NonNullable<SessionInfo>;
  onLogout: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutFromPanel();
      onLogout();
    });
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="border border-stone p-6">
        <h3 className="text-lg heading-serif text-navy mb-1">Welcome back</h3>
        <p className="text-ink-light">
          {session.firstName} {session.lastName}
        </p>
        <p className="text-sm text-ink-light">{session.email}</p>
      </div>

      <nav className="space-y-2">
        <Link
          href="/account"
          className="flex items-center gap-3 px-4 py-3 hover:bg-stone-warm transition-colors duration-300"
        >
          <User className="h-5 w-5 text-ink-faint" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">My Account</span>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-3 px-4 py-3 hover:bg-stone-warm transition-colors duration-300"
        >
          <FileText className="h-5 w-5 text-ink-faint" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">My Quotes</span>
        </Link>
        <Link
          href="/account/orders"
          className="flex items-center gap-3 px-4 py-3 hover:bg-stone-warm transition-colors duration-300"
        >
          <Package className="h-5 w-5 text-ink-faint" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">Order History</span>
        </Link>
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="flex items-center gap-3 px-4 py-3 hover:bg-stone-warm transition-colors duration-300 w-full text-left disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 text-ink-faint" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">
            {isPending ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </nav>
    </div>
  );
}
