import { NextResponse } from 'next/server';
import { reconcileStripePayments } from '@/lib/stripe/webhook-handlers';
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret';

export async function GET(request: Request) {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await reconcileStripePayments();
  return NextResponse.json(result);
}
