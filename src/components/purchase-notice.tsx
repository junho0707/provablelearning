"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { purchaseRecorded } from "@/lib/billing/settlement";
import { NOTICE } from "@/lib/ui";

/** Poll interval, growing so a slow webhook costs a handful of requests rather than dozens. */
const FIRST_POLL_MS = 1000;
const MAX_POLL_MS = 5000;
/** How long to keep watching before admitting it hasn't landed. Stripe retries for far longer. */
const GIVE_UP_MS = 90_000;
/**
 * A First Session webhook records the purchase and *then* books the slot against it, so the row
 * this watches for appears a moment before the booking does. One more pass after settling catches
 * the booking; without it the dashboard can land on "paid, not booked" and stay there.
 */
const TAIL_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The "payment received" banner, and the thing that takes it away again.
 *
 * `?purchase=<checkout session id>` is what puts this on screen. A query parameter does not know
 * when the webhook landed, so this asks — repeatedly, until the purchase it is named after is
 * actually recorded. Then it re-reads the page and drops the parameter, so what replaces the
 * banner is the real balance or the real booking.
 *
 * It used to refresh on three fixed timers and strip the parameter at eleven seconds whether or
 * not anything had arrived. A webhook slower than that left the buyer on a stale page with no
 * banner and nothing to tell them to reload — which is the reason to never guess here.
 */
export function PurchaseNotice({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let live = true;
    const deadline = Date.now() + GIVE_UP_MS;
    let wait = FIRST_POLL_MS;

    (async () => {
      while (live) {
        // No session id means a checkout started before this page knew to carry one. There is
        // nothing precise to watch, so re-read the page each pass and let the buyer see it land.
        const recorded = sessionId ? await purchaseRecorded(sessionId) : null;
        if (!live) return;

        if (recorded) {
          router.refresh();
          await sleep(TAIL_MS);
          if (!live) return;
          router.refresh();
          router.replace(pathname);
          return;
        }

        if (recorded === null) router.refresh();
        if (Date.now() > deadline) return setSlow(true);

        await sleep(wait);
        wait = Math.min(wait * 2, MAX_POLL_MS);
      }
    })();

    return () => {
      live = false;
    };
  }, [router, pathname, sessionId]);

  if (slow) {
    return (
      <p className={`mt-8 ${NOTICE}`}>
        <strong className="font-semibold text-navy-950">Your payment went through</strong> — but
        it&apos;s taking longer than usual to show up here. Nothing is lost.{" "}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="font-semibold text-navy-950 underline"
        >
          Check again
        </button>
        , or email us if it still isn&apos;t here in a few minutes.
      </p>
    );
  }

  return <>{children}</>;
}
