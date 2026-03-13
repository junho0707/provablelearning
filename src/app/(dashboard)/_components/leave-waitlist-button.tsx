'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { leaveWaitlistAction } from './waitlist-actions';

export function LeaveWaitlistButton({ waitlistId }: { waitlistId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleLeave() {
    setSubmitting(true);
    setError('');
    const result = await leaveWaitlistAction(waitlistId);
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
          onClick={handleLeave}
          disabled={submitting}
          className="text-error hover:underline disabled:opacity-50 text-xs"
        >
          {submitting ? 'Leaving...' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-slate-400 hover:underline text-xs"
        >
          No
        </button>
        {error && <span className="text-error text-xs">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-red-400 hover:text-error hover:underline text-xs ml-1"
    >
      Leave
    </button>
  );
}
