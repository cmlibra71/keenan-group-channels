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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-text-primary" />
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
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">Sign in to your account</p>
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
          <label htmlFor="panel-email" className="field-label">
            Email
          </label>
          <input
            type="email"
            id="panel-email"
            name="email"
            required
            className="mt-1 block w-full input"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="panel-password"
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
        <User className="h-12 w-12 text-text-muted mx-auto" strokeWidth={1.5} />
        <p className="mt-2 text-text-secondary">Create an account</p>
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
            <label htmlFor="panel-firstName" className="field-label">
              First Name
            </label>
            <input
              type="text"
              id="panel-firstName"
              name="firstName"
              required
              className="mt-1 block w-full input"
            />
          </div>
          <div>
            <label htmlFor="panel-lastName" className="field-label">
              Last Name
            </label>
            <input
              type="text"
              id="panel-lastName"
              name="lastName"
              required
              className="mt-1 block w-full input"
            />
          </div>
        </div>
        <div>
          <label htmlFor="panel-reg-email" className="field-label">
            Email
          </label>
          <input
            type="email"
            id="panel-reg-email"
            name="email"
            required
            className="mt-1 block w-full input"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-reg-password" className="field-label">
            Password
          </label>
          <input
            type="password"
            id="panel-reg-password"
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
      <div className="card-padded">
        <h3 className="panel-title mb-1">Welcome back</h3>
        <p className="text-text-secondary">
          {session.firstName} {session.lastName}
        </p>
        <p className="text-sm text-text-secondary">{session.email}</p>
      </div>

      <nav className="space-y-2">
        <Link
          href="/account"
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors duration-300"
        >
          <User className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <span className="text-sm font-medium text-text-body">My Account</span>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors duration-300"
        >
          <FileText className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <span className="text-sm font-medium text-text-body">My Quotes</span>
        </Link>
        <Link
          href="/account/orders"
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors duration-300"
        >
          <Package className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <span className="text-sm font-medium text-text-body">Order History</span>
        </Link>
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary transition-colors duration-300 w-full text-left disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <span className="text-sm font-medium text-text-body">
            {isPending ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </nav>
    </div>
  );
}
