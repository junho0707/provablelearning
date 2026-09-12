"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VIEWER_TIMEZONE_COOKIE } from "@/lib/booking/timezone-cookie";

/**
 * Tells the server which time zone the visitor is in, so server-rendered times are in their hours
 * rather than the server's (`viewer-timezone.ts`).
 *
 * Writes the cookie and refreshes only when it actually changed — the common case is a returning
 * visitor whose cookie is already right, which costs nothing. A visitor who travels, or changes
 * their machine's clock, corrects on their next page view.
 */
export function TimeZoneProbe() {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;

    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${VIEWER_TIMEZONE_COOKIE}=`))
      ?.slice(VIEWER_TIMEZONE_COOKIE.length + 1);
    if (current === zone) return;

    // A year, SameSite=Lax so it rides the Stripe return redirect; not sensitive, so not HttpOnly
    // — the browser is the only thing that knows this value in the first place.
    document.cookie = `${VIEWER_TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
