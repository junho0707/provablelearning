'use client';

import { useState } from 'react';
import { payNowAction } from '@/lib/enrollment/pay-now';

interface Props {
  enrollmentId: string;
}

export function PayNowButton({ enrollmentId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');

    const result = await payNowAction(enrollmentId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else if (result.url) {
      window.location.href = result.url;
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded bg-navy-900 px-3 py-1.5 text-white text-sm font-medium hover:bg-navy-800 disabled:opacity-50"
      >
        {loading ? 'Redirecting...' : 'Pay Now'}
      </button>
      {error && <p className="text-error text-xs mt-1">{error}</p>}
    </div>
  );
}
