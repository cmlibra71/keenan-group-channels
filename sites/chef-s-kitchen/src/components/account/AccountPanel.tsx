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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
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
        <User className="h-12 w-12 text-zinc-300 mx-auto" />
        <p className="mt-2 text-zinc-500">Sign in to your account</p>
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
          <label htmlFor="panel-email" className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            id="panel-email"
            name="email"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="panel-password"
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
        <User className="h-12 w-12 text-zinc-300 mx-auto" />
        <p className="mt-2 text-zinc-500">Create an account</p>
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
            <label htmlFor="panel-firstName" className="block text-sm font-medium text-zinc-700">
              First Name
            </label>
            <input
              type="text"
              id="panel-firstName"
              name="firstName"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="panel-lastName" className="block text-sm font-medium text-zinc-700">
              Last Name
            </label>
            <input
              type="text"
              id="panel-lastName"
              name="lastName"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label htmlFor="panel-reg-email" className="block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            id="panel-reg-email"
            name="email"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder="your@email.com"
          />
        </div>
        <div>
          <label htmlFor="panel-reg-password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            id="panel-reg-password"
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
      <div className="border border-zinc-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-zinc-900 mb-1">Welcome back</h3>
        <p className="text-zinc-600">
          {session.firstName} {session.lastName}
        </p>
        <p className="text-sm text-zinc-500">{session.email}</p>
      </div>

      <nav className="space-y-2">
        <Link
          href="/account"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          <User className="h-5 w-5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700">My Account</span>
        </Link>
        <Link
          href="/account/quotes"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          <FileText className="h-5 w-5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700">My Quotes</span>
        </Link>
        <Link
          href="/account/orders"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          <Package className="h-5 w-5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700">Order History</span>
        </Link>
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-50 transition-colors w-full text-left disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-700">
            {isPending ? "Signing out..." : "Sign Out"}
          </span>
        </button>
      </nav>
    </div>
  );
}
