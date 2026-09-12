"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { createClient } from "@/lib/supabase/client";

/**
 * Google sign-in through Google Identity Services, not through Supabase's redirect flow.
 *
 * The redirect flow (`signInWithOAuth`) hands Google `redirect_uri=<project-ref>.supabase.co`, and
 * Google's consent screen names the host that receives the token — so the buyer was asked to sign
 * in to a string of random letters they had never seen. Google will not show our domain there:
 * brand verification requires owning every authorized domain, and `supabase.co` is not ours.
 *
 * GIS mints the ID token for our *JavaScript origin* instead, so the popup says
 * provablelearning.com and no redirect happens at all. Supabase accepts the token because our
 * client id is listed under the Google provider's Authorized Client IDs.
 *
 * Google only issues an ID token from a button it renders itself, so the markup below is theirs,
 * configured to sit as close to our own buttons as its options allow.
 */

type CredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            nonce?: string;
            ux_mode?: "popup" | "redirect";
            itp_support?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
            },
          ): void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * A nonce ties the token to this page load. Supabase hashes what we give it and compares that to
 * what Google embedded, so Google gets the hash and Supabase gets the original.
 */
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function GoogleButton({
  onSuccess,
  redirectTo = "/dashboard",
}: { onSuccess?: () => void; redirectTo?: string } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nonceRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCredential = useCallback(
    async (response: CredentialResponse) => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce: nonceRef.current ?? undefined,
      });
      if (error) {
        console.error("[auth] Google id-token sign-in failed:", error.message);
        setFailed(true);
        return;
      }
      onSuccess?.();
      // This is the only place a Google sign-in decides where it lands: signing in from the
      // landing left the buyer on a marketing page for a product they had just signed into.
      //
      // A whole document load, not `router.push`. The session cookie was written a moment ago by
      // the browser client; a client-side navigation renders the destination from a router cache
      // populated while signed out, so the buyer arrived at a page that still believed nobody was
      // there and bounced straight back here. Only a fresh request carries the new cookie to the
      // server components that gate these pages — which is why pressing reload was what worked.
      window.location.assign(redirectTo);
    },
    [onSuccess, redirectTo],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!ready || !container || !CLIENT_ID) return;

    // `initialize` configures one global client, so only one of these buttons may be mounted at a
    // time — a second would take the callback away from the first.
    let cancelled = false;
    makeNonce().then(({ raw, hashed }) => {
      if (cancelled || !window.google) return;
      nonceRef.current = raw;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        nonce: hashed,
        ux_mode: "popup",
        itp_support: true,
      });
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        // Google caps its button at 400px; ours is as wide as the form it sits in.
        width: Math.min(container.offsetWidth || 400, 400),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, handleCredential]);

  // Without a client id there is no button to render, and the email form below it still works.
  if (!CLIENT_ID) return null;

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} />
      <div ref={containerRef} className="min-h-[2.5rem] [color-scheme:light]" />
      {failed && (
        <p className="mt-2 text-[0.875rem] text-[var(--error)]">
          That sign-in didn&apos;t go through. Try again, or use your email below.
        </p>
      )}
    </>
  );
}
