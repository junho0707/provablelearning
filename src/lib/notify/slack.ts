import { TUTOR_TIMEZONE } from "@/lib/booking/timezone";
import { sessionTime } from "@/lib/time-format";
import { absoluteUrl } from "@/lib/site";

/**
 * The operator channel.
 *
 * `system/02-POLICIES.md` §11 splits buyer-facing notification by actor — the buyer by email, the
 * student in-app. This is the third channel and the only one pointed at the operator: the admin
 * worklists (`/admin/bookings`, `/admin/materials`, `/admin/messages`, `/admin/credit-returns`)
 * are correct and invisible, because a solo operator does not refresh four queues on a schedule.
 *
 * One incoming webhook, one channel. Every send is best-effort and returns a boolean instead of
 * throwing — the same posture as the email senders and `createCalendarEvent`: an alert that fails
 * must never break the purchase, booking, or cancellation that triggered it. With no webhook
 * configured — dev, tests, previews — it is a silent no-op, so nothing has to be stubbed.
 */
export async function notifyOperator(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Times in operator alerts are stated in the **tutor's** zone, named — the same choice the email
 * senders make (ADR-003), and here there is no buyer whose zone it could otherwise be.
 */
export function alertTime(startsAt: string): string {
  return sessionTime(startsAt, TUTOR_TIMEZONE);
}

/** A worklist link, so an alert is one click from the queue that can act on it. */
export function adminLink(pathname: string): string {
  return absoluteUrl(pathname);
}
