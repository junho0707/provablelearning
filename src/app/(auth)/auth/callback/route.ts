import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the OAuth/magic-link code for a session.
 *
 * Two callers hit this route: a full-page magic-link click, and the Google popup opened by
 * `GoogleButton` (marked `?popup=1`). The popup case can't redirect — there's nothing to redirect
 * *to* inside a small popup window — so instead it renders a page that tells the opener tab it's
 * done and closes itself.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const isPopup = searchParams.get("popup") === "1";

  let ok = false;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (isPopup) {
    return new Response(popupCloseHtml(ok), { headers: { "Content-Type": "text/html" } });
  }

  if (ok) return NextResponse.redirect(`${origin}${next}`);
  return NextResponse.redirect(`${origin}/login?error=auth`);
}

function popupCloseHtml(ok: boolean) {
  return `<!doctype html><html><body><script>
    if (window.opener) {
      window.opener.postMessage({ type: "oauth-complete", ok: ${ok} }, window.location.origin);
    }
    window.close();
  </script></body></html>`;
}
