"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * The "payment received" banner, and the thing that takes it away again.
 *
 * Stripe redirects back the instant the card clears, a second or two ahead of the webhook that
 * records the purchase. `?purchase=success` is what puts this on screen — but a query parameter
 * does not know when the webhook landed, so left alone the banner sits there promising something
 * that already happened, above the thing it promised.
 *
 * So it refreshes the server data a few times, then drops the parameter. The banner clears itself,
 * and what replaces it is the real balance or the real booking.
 */
export function PurchaseNotice({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const timers = [2000, 5000, 9000].map((ms) => setTimeout(() => router.refresh(), ms));
    timers.push(setTimeout(() => router.replace(pathname), 11000));
    return () => timers.forEach(clearTimeout);
  }, [router, pathname]);

  return <>{children}</>;
}
