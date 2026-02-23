"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { googleSignIn } from "@/lib/actions/google-auth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            config: {
              theme?: string;
              size?: string;
              width?: number;
              text?: string;
              shape?: string;
            }
          ) => void;
        };
      };
    };
  }
}

type SessionInfo = {
  customerId: number;
  email: string;
  firstName: string;
  lastName: string;
};

export function GoogleSignInButton({
  onSuccess,
}: {
  onSuccess: (session: SessionInfo) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initializedRef = useRef(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  function initializeGoogle() {
    if (!clientId || !window.google || !buttonRef.current || initializedRef.current) return;
    initializedRef.current = true;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setError(null);
        setLoading(true);
        try {
          const result = await googleSignIn(response.credential);
          if (result.error) {
            setError(result.error);
          } else if (result.session) {
            onSuccess(result.session);
          }
        } catch {
          setError("Google sign-in failed. Please try again.");
        } finally {
          setLoading(false);
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "signin_with",
      shape: "rectangular",
    });
  }

  useEffect(() => {
    // If the script is already loaded (e.g., navigating back), initialize immediately
    if (window.google) {
      initializeGoogle();
    }
  }, []);

  if (!clientId) return null;

  return (
    <div>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onLoad={initializeGoogle}
      />
      <div ref={buttonRef} className="flex justify-center" />
      {loading && (
        <p className="text-center text-sm text-zinc-500 mt-2">Signing in...</p>
      )}
      {error && (
        <p className="text-center text-sm text-red-600 mt-2">{error}</p>
      )}
    </div>
  );
}
