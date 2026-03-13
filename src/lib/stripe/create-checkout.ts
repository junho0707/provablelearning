import { stripe } from './client';
import { getPriceForGroupSize, formatPrice } from './prices';
import { PENDING_ENROLLMENT_TTL_MINUTES } from '@/lib/constants';

interface CheckoutParams {
  enrollmentId: string;
  studentId: string;
  classId: string;
  groupSizeType: string;
  className: string;
  amountInCents: number;
  customerEmail?: string;
  isPayLater?: boolean;
}

export async function createCheckoutSession(params: CheckoutParams) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'us_bank_account'],
    customer_email: params.customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${params.className} — ${params.groupSizeType.replace('_', ' ')} group`,
          },
          unit_amount: params.amountInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      enrollment_id: params.enrollmentId,
      student_id: params.studentId,
      class_id: params.classId,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/enroll/success?session_id={CHECKOUT_SESSION_ID}${params.isPayLater ? '&from=pay_later' : ''}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/enroll/cancel?enrollment_id=${params.enrollmentId}`,
    expires_at: Math.floor(Date.now() / 1000) + PENDING_ENROLLMENT_TTL_MINUTES * 60,
  });

  return session;
}

export { getPriceForGroupSize, formatPrice };
