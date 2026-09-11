import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Exchanges the magic-link code for a session.
 *
 * The session cookies are collected from the client and written onto the response we return, rather
 * than through the shared `cookies()` store: a cookie mutation that isn't attached to the returned
 * response is silently lost, leaving a browser that is redirected onward but still signed out.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Signing in lands in the product, not on the marketing page; the nav logo is what
  // goes back to the landing.
  const next = searchParams.get("next") ?? "/dashboard";

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
    if (ok && email && viaEmail) {
      const { data: hasPassword } = await supabase.rpc("email_has_password", { p_email: email });
      if (!hasPassword) destination = `/set-password?next=${encodeURIComponent(next)}`;
    }
  }

  const response = NextResponse.redirect(`${origin}${ok ? destination : "/login?error=auth"}`);

  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }

  return response;
}

