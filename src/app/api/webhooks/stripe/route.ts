import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import {
  handleCheckoutCompleted,
  handleCheckoutExpired,
  handlePaymentFailed,
} from '@/lib/stripe/webhook-handlers';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object);
      break;
    case 'checkout.session.async_payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    default:
      // Unhandled event type
      break;
  }

  return NextResponse.json({ received: true });
}
