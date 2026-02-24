'use client';

import { processRefund } from './actions';

interface Props {
  enrollmentId: string;
  studentId: string;
  groupSizeType: string;
  stripeSessionId: string | null;
  creditsApplied: number;
}

export default function RefundForm({
  enrollmentId,
  studentId,
  groupSizeType,
  stripeSessionId,
  creditsApplied,
}: Props) {
  const paidWithCredits = creditsApplied > 0;
  const paidWithStripe = !!stripeSessionId && !paidWithCredits;

  async function handleRefund(formData: FormData) {
    formData.set('enrollment_id', enrollmentId);
    formData.set('student_id', studentId);
    formData.set('group_size_type', groupSizeType);
    formData.set('stripe_session_id', stripeSessionId || '');
    formData.set('credits_applied', String(creditsApplied));

    if (!confirm('Process this refund/cancellation?')) return;
    await processRefund(formData);
  }

  return (
    <form action={handleRefund} className="flex gap-2">
      <select name="refund_type" className="rounded border px-2 py-1 text-sm">
        {paidWithCredits && (
          <option value="credit_reversal">Restore Credit</option>
        )}
        {paidWithStripe && (
          <>
            <option value="stripe_refund">Stripe Refund</option>
            <option value="credit">Issue Credit Instead</option>
          </>
        )}
        {!paidWithCredits && !paidWithStripe && (
          <option value="none">Cancel (No Payment Found)</option>
        )}
        <option value="none">Cancel Without Refund</option>
      </select>
      <button
        type="submit"
        className="rounded bg-red-50 border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-100"
      >
        Process
      </button>
    </form>
  );
}
