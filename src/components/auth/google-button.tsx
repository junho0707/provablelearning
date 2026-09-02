"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Google sign-in as a popup window, not a full-page redirect. Google refuses to render its login
 * screen inside an iframe (blocks it via X-Frame-Options), so a real `window.open` popup — not an
 * inline modal — is the only way to keep the visitor on this page while they authenticate.
 *
 * Flow: open a blank popup synchronously (so browsers don't treat it as a blocked pop-up), fetch
 * the OAuth URL, point the popup at it. `/auth/callback?popup=1` renders a page that posts a
 * message back to this window and closes itself; we react to that message.
 */
export function GoogleButton({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-complete") return;
      popupRef.current = null;
      if (event.data.ok) {
        router.refresh();
        onSuccess?.();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, onSuccess]);

  async function handleClick() {
    const width = 480;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "",
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
    popupRef.current = popup;

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?popup=1`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url || !popup) {
      popup?.close();
      return;
    }
    popup.location.href = data.url;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-navy-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 hover:bg-navy-50"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.87 2.69-6.64Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.34C2.44 15.98 5.48 18 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3-2.34Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3 2.34C4.67 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
      Continue with Google
    </button>
  );
}
