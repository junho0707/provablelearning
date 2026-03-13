import { sendEmail } from './send-email';
import { sendSms } from './send-sms';

interface BookingNotification {
  contactMethod: 'email' | 'sms' | 'both';
  email: string;
  phone: string;
  parentName: string;
  dateTime: string;
  meetingType: 'meet' | 'phone';
  meetLink?: string | null;
  type: 'confirmation' | 'reminder';
}

function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  const date = dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${date} at ${time} ET`;
}

function buildSubject(type: 'confirmation' | 'reminder'): string {
  return type === 'confirmation'
    ? 'Your Consultation is Confirmed'
    : 'Reminder: Consultation Tomorrow';
}

function buildHtml(n: BookingNotification): string {
  const when = formatDateTime(n.dateTime);
  const meetInfo =
    n.meetingType === 'meet' && n.meetLink
      ? `<p><strong>Google Meet:</strong> <a href="${n.meetLink}">${n.meetLink}</a></p>`
      : n.meetingType === 'phone'
        ? `<p><strong>Phone call</strong> — your tutor will call you at ${n.phone}.</p>`
        : '';

  const heading =
    n.type === 'confirmation'
      ? 'Your consultation has been booked!'
      : 'Your consultation is coming up tomorrow.';

  return `
    <div style="font-family: sans-serif; max-width: 480px;">
      <h2>${heading}</h2>
      <p><strong>When:</strong> ${when}</p>
      ${meetInfo}
      <p>If you need to reschedule, please reply to this email.</p>
      <p>— ProvableLearning</p>
    </div>
  `.trim();
}

function buildSmsBody(n: BookingNotification): string {
  const when = formatDateTime(n.dateTime);
  const prefix = n.type === 'confirmation' ? 'Booking confirmed!' : 'Reminder:';
  const meetInfo =
    n.meetingType === 'meet' && n.meetLink
      ? `Join: ${n.meetLink}`
      : n.meetingType === 'phone'
        ? 'Your tutor will call you.'
        : '';

  return `${prefix} Consultation on ${when}. ${meetInfo}`.trim();
}

export async function sendBookingNotification(n: BookingNotification) {
  const promises: Promise<void>[] = [];

  // Always send email for confirmations (reliable channel).
  // For reminders, respect contactMethod preference.
  const shouldEmail =
    n.type === 'confirmation' || n.contactMethod === 'email' || n.contactMethod === 'both';
  const shouldSms = n.contactMethod === 'sms' || n.contactMethod === 'both';

  if (shouldEmail) {
    promises.push(
      sendEmail({
        to: n.email,
        subject: buildSubject(n.type),
        html: buildHtml(n),
      }),
    );
  }

  if (shouldSms) {
    promises.push(
      sendSms({
        to: n.phone,
        body: buildSmsBody(n),
      }),
    );
  }

  const results = await Promise.allSettled(promises);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(
      'Booking notification failures:',
      failures.map((f) => (f as PromiseRejectedResult).reason),
    );
  }
}
