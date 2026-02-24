import { timingSafeEqual } from 'crypto';

export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET environment variable is not set');
    return false;
  }

  if (!authHeader) return false;

  const expected = `Bearer ${secret}`;

  // Timing-safe comparison to prevent timing attacks
  if (authHeader.length !== expected.length) return false;

  return timingSafeEqual(
    Buffer.from(authHeader),
    Buffer.from(expected)
  );
}
