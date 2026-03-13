import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!;

/** Normalize a US phone number to E.164 format (+1XXXXXXXXXX) */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Already has country code or international
  return `+${digits}`;
}

export async function sendSms({
  to,
  body,
}: {
  to: string;
  body: string;
}) {
  await client.messages.create({
    from: FROM_NUMBER,
    to: toE164(to),
    body,
  });
}
