'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelMakeupBooking } from '@/lib/cancellation/cancel-makeup';

export function CancelMakeupButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleCancel() {
    setSubmitting(true);
    setError('');
    const result = await cancelMakeupBooking(bookingId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 ml-1">
        <button
          onClick={handleCancel}
          disabled={submitting}
          className="text-error hover:underline disabled:opacity-50"
        >
          {submitting ? 'Cancelling...' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-slate-400 hover:underline"
        >
          No
        </button>
        {error && <span className="text-error">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-red-400 hover:text-error hover:underline ml-1"
    >
      Cancel
    </button>
  );
}
