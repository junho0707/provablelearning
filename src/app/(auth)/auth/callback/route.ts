import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Exchanges the OAuth/magic-link code for a session.
 *
 * Two callers hit this route: a full-page magic-link click, and the Google popup opened by
 * `GoogleButton` (marked `?popup=1`). The popup case can't redirect — there's nothing to redirect
 * *to* inside a small popup window — so instead it renders a page that tells the opener tab it's
 * done and closes itself.
 *
 * The session cookies are collected from the client and written onto the response we return, rather
 * than through the shared `cookies()` store: the popup branch answers with a plain HTML body, and a
 * cookie mutation that isn't attached to the returned response is silently lost — leaving a popup
 * that reports success to a browser that is still signed out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Signing in lands in the product, not on the marketing page; the nav logo is what
  // goes back to the landing.
  const next = searchParams.get("next") ?? "/dashboard";
  const isPopup = searchParams.get("popup") === "1";

  const cookieStore = await cookies();
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          pending.push(...cookiesToSet);
        },
      },
    },
  );

  let ok = false;
  let destination = next;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] code exchange failed:", error.message);
    ok = !error;

    // A magic-link arrival with no password set is the one moment we can offer to set one: they
    // are signed in, so `updateUser` will work, and they got here precisely because they had no
    // password to type. Google arrivals are skipped — that identity is their sign-in method.
    const email = data?.user?.email;
    const viaEmail = data?.user?.app_metadata?.provider === "email";
    if (ok && email && viaEmail && !isPopup) {
      const { data: hasPassword } = await supabase.rpc("email_has_password", { p_email: email });
      if (!hasPassword) destination = `/set-password?next=${encodeURIComponent(next)}`;
    }
  }

  const response = isPopup
    ? new NextResponse(popupCloseHtml(ok), { headers: { "Content-Type": "text/html" } })
    : NextResponse.redirect(`${origin}${ok ? destination : "/login?error=auth"}`);

  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function popupCloseHtml(ok: boolean) {
  return `<!doctype html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth-complete", ok: ${ok} }, window.location.origin);
    }
    window.close();
  </script></body></html>`;
}
