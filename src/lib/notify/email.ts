import { Resend } from "resend";
import { formatPrice, type SkuId } from "@/lib/pricing";

function resendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY.");
  return new Resend(key);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "hello@provablelearning.com";

function formatSessionTime(startsAt: string): string {
  return new Date(startsAt).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

/**
 * TASK-NOTIFY-001. Resend for all transactional mail (spec/14 §12). Every sender here returns a
 * boolean rather than throwing — a failed send must not break the booking/purchase flow that
 * triggered it (same resilience posture as `createCalendarEvent`); the cron reminder loop uses the
 * boolean to decide whether it's safe to flip the idempotency flag.
 */
export async function sendBookingConfirmation(params: { to: string; startsAt: string; meetUrl: string | null }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: "Your session is booked",
      html: `<p>Your session is confirmed for <strong>${formatSessionTime(params.startsAt)}</strong>.</p>` +
        (params.meetUrl
          ? `<p>Join here: <a href="${params.meetUrl}">${params.meetUrl}</a></p>`
          : `<p>We'll send the video call link shortly.</p>`),
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendReminder(params: { to: string; startsAt: string; meetUrl: string | null; hoursOut: 24 | 1 }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: params.hoursOut === 24 ? "Session reminder — tomorrow" : "Session reminder — starting soon",
      html: `<p>Your session starts in about ${params.hoursOut} hour${params.hoursOut === 1 ? "" : "s"}, at ` +
        `<strong>${formatSessionTime(params.startsAt)}</strong>.</p>` +
        (params.meetUrl ? `<p>Join here: <a href="${params.meetUrl}">${params.meetUrl}</a></p>` : ""),
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendReceipt(params: { to: string; sku: SkuId; amountCents: number }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: "Your receipt",
      html: `<p>Thanks for your purchase — ${formatPrice(params.amountCents)} for ${params.sku.replace(/_/g, " ")}.</p>`,
    });
    return true;
  } catch {
    return false;
  }
}
