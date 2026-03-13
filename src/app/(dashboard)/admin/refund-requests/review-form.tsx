'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { approveRefundRequest, denyRefundRequest } from './actions';

interface ReviewFormProps {
  requestId: string;
  stripeSessionId: string | null;
  creditsApplied: number | null;
  groupSizeType: string | null;
}

export function ReviewForm({
  requestId,
  stripeSessionId,
  creditsApplied,
  groupSizeType,
}: ReviewFormProps) {
  const [notes, setNotes] = useState('');
  const [refundType, setRefundType] = useState('none');
  const [showApproveOptions, setShowApproveOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hasPaid = !!stripeSessionId;
  const hasCredits = (creditsApplied ?? 0) > 0;

  async function handleApprove() {
    if (!showApproveOptions) {
      setShowApproveOptions(true);
      return;
    }

    setError(null);
    const fd = new FormData();
    fd.set('request_id', requestId);
    fd.set('refund_type', refundType);
    fd.set('admin_notes', notes);

    startTransition(async () => {
      const result = await approveRefundRequest(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  async function handleDeny() {
    setError(null);
    const fd = new FormData();
    fd.set('request_id', requestId);
    fd.set('admin_notes', notes);

    startTransition(async () => {
      const result = await denyRefundRequest(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Payment context */}
      <div className="flex gap-2 text-xs">
        {hasPaid && (
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Paid via Stripe</span>
        )}
        {hasCredits && (
          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
            {creditsApplied} credit(s) applied ({(groupSizeType || '').replace(/_/g, ' ')})
          </span>
        )}
        {!hasPaid && !hasCredits && (
          <span className="bg-slate-50 text-slate-500 px-2 py-0.5 rounded">No payment on file</span>
        )}
      </div>

      {/* Refund type selector (shown after clicking Approve) */}
      {showApproveOptions && (
        <div className="bg-success-light border border-green-200 rounded p-3 space-y-2">
          <p className="text-sm font-medium text-green-800">Select refund type:</p>
          <div className="space-y-1">
            {hasPaid && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="refund_type"
                  value="stripe_refund"
                  checked={refundType === 'stripe_refund'}
                  onChange={(e) => setRefundType(e.target.value)}
                />
                Stripe Refund (return payment to card)
              </label>
            )}
            {hasCredits && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="refund_type"
                  value="credit_reversal"
                  checked={refundType === 'credit_reversal'}
                  onChange={(e) => setRefundType(e.target.value)}
                />
                Credit Reversal (restore used credits)
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="refund_type"
                value="credit"
                checked={refundType === 'credit'}
                onChange={(e) => setRefundType(e.target.value)}
              />
              Issue Credit (add 1 lesson credit)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="refund_type"
                value="none"
                checked={refundType === 'none'}
                onChange={(e) => setRefundType(e.target.value)}
              />
              No refund (cancel enrollment only)
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-2 items-end">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Admin notes (optional)"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          onClick={handleApprove}
          disabled={isPending}
          className="rounded bg-green-600 px-4 py-2 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? 'Processing...' : showApproveOptions ? 'Confirm Approve' : 'Approve'}
        </button>
        <button
          onClick={handleDeny}
          disabled={isPending}
          className="rounded bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          Deny
        </button>
        {showApproveOptions && (
          <button
            onClick={() => setShowApproveOptions(false)}
            disabled={isPending}
            className="rounded border px-3 py-2 text-sm text-slate-600 hover:bg-navy-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
