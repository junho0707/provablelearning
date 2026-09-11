import { Resend } from "resend";
import { formatPrice, type SkuId } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";

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
/**
 * Both session emails go to the **buyer**, never the student (`INV-AUTH-2` — no email of any kind
 * reaches a student, and no student address exists in the schema). So the Meet link arrives in a
 * parent's inbox under the word "Join", which reads as an invitation to the parent. It is not: the
 * session is 1:1 with the student. The copy says whose link it is and asks the parent to pass it
 * on, and points at the student's own home screen as the path that does not depend on them doing so.
 */
export async function sendBookingConfirmation(params: { to: string; startsAt: string; meetUrl: string | null }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: "Your session is booked",
      html: `<p>Your session is booked for <strong>${formatSessionTime(params.startsAt)}</strong>.</p>` +
        (params.meetUrl
          ? `<p><strong>Please pass this link to your student</strong> — it is the one they join on:<br>` +
            `<a href="${params.meetUrl}">${params.meetUrl}</a></p>` +
            `<p>They can also start it themselves: it is on their home screen when they sign in, so ` +
            `nothing is lost if this email does not reach them. The session is 1:1 with your ` +
            `student, so you do not need to join.</p>`
          : `<p>We'll send the video call link shortly — it is the link your student joins on, so ` +
            `please pass it to them when it arrives. It also appears on their home screen when ` +
            `they sign in.</p>`),
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
        (params.meetUrl
          ? `<p><strong>Your student's link</strong> — pass it on, or they can start from their own ` +
            `home screen:<br><a href="${params.meetUrl}">${params.meetUrl}</a></p>`
          : ""),
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

/**
 * F11 step 2. The reply itself is not in the email — the thread lives in the app, and a buyer who
 * replies to a notification would be replying to nowhere. Only the buyer is notified; the tutor
 * works the inbox (system/02-POLICIES.md §11).
 */
export async function sendMessageReply(params: { to: string }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: params.to,
      subject: "Your tutor replied",
      html:
        `<p>Your tutor has replied to your message.</p>` +
        `<p><a href="${absoluteUrl("/messages")}">Read it here</a></p>`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The landing page's contact form, not a transactional event — but it goes through the same sender
 * so there is one place that owns `RESEND_API_KEY` and the `FROM` address. `reply-to` is the
 * visitor's own address, so replying in the inbox goes straight back to them without exposing
 * `admin@` on the page for a scraper to find (`ObfuscatedEmail` did this with JS; a server-side
 * form and a honeypot field do it without shipping the address to the browser at all).
 */
export async function sendContactMessage(params: { fromEmail: string; message: string }): Promise<boolean> {
  try {
    await resendClient().emails.send({
      from: FROM,
      to: "admin@provablelearning.com",
      replyTo: params.fromEmail,
      subject: "Contact form",
      html: `<p>From: ${params.fromEmail}</p><p>${params.message.replace(/\n/g, "<br>")}</p>`,
    });
    return true;
  } catch {
    return false;
  }
}
