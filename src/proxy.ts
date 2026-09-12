import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** `sb-<project-ref>-auth-token`, plus the `.0`/`.1` chunks a large session is split across. */
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/** Refresh this far ahead of real expiry, so no page renders against a token that dies mid-request. */
const REFRESH_WINDOW_SECONDS = 5 * 60;

/** The session's `expires_at` (unix seconds), or null when the cookie isn't a shape we recognise. */
function readExpiry(chunks: Array<{ name: string; value: string }>): number | null {
  try {
    // Mirrors @supabase/ssr's `combineChunks`: an unchunked cookie is the whole value, and chunks
    // join in numeric order (`.10` after `.9`, which a lexicographic sort would get wrong).
    const whole = chunks.find((c) => !c.name.includes("."));
    const ordered = whole
      ? [whole]
      : [...chunks].sort((a, b) => Number(a.name.split(".")[1]) - Number(b.name.split(".")[1]));
    let raw = ordered.map((c) => c.value).join("");

    if (raw.startsWith("base64-")) {
      const b64 = raw.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      raw = new TextDecoder().decode(bytes);
    }

    const expiresAt = JSON.parse(raw)?.expires_at;
    return typeof expiresAt === "number" ? expiresAt : null;
  } catch {
    return null;
  }
}

/**
 * Whether this request needs Supabase contacted at all.
 *
 * A signed-out visitor has nothing to refresh. Nor does a signed-in one whose token is still good
 * for a while — `getUser()` would spend a network round trip revalidating a token it was never
 * going to replace. Only an unreadable cookie falls through to Supabase, which knows better than
 * this parser does.
 */
function needsRefresh(request: NextRequest): boolean {
  const chunks = request.cookies.getAll().filter((c) => AUTH_COOKIE.test(c.name));
  if (chunks.length === 0) return false;

  const expiresAt = readExpiry(chunks);
  if (expiresAt === null) return true;
  return expiresAt - Date.now() / 1000 <= REFRESH_WINDOW_SECONDS;
}

/**
 * Refreshes the Supabase auth session cookie (required by @supabase/ssr — without this, a signed-in
 * user's session silently expires mid-visit). No route protection here; RLS is the actual access
 * boundary (ACCT-001), and every page re-checks the caller itself.
 *
 * This used to call `getUser()` unconditionally, which put a blocking round trip to Supabase Auth
 * in front of *every* request a signed-in visitor made — each tab switch paid for it before the
 * page began rendering. The refresh now happens only when the token is actually near expiry, so
 * that cost is paid about once an hour instead of once a navigation.
 */
export async function proxy(request: NextRequest) {
  if (!needsRefresh(request)) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Webhooks and cron carry no session to refresh, so they skip this entirely.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
