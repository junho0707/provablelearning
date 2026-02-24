'use client';

import { useState } from 'react';
import { reviewMakeupRequest } from './actions';

export function MakeupReviewForm({ logId }: { logId: string }) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  async function handleDecision(decision: 'approved' | 'denied') {
    setLoading(true);
    await reviewMakeupRequest({ logId, decision, adminNote: note || undefined });
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return <p className="text-sm text-green-600">Decision recorded.</p>;
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="text"
        placeholder="Admin note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="flex-1 rounded border px-2 py-1 text-sm"
      />
      <button
        onClick={() => handleDecision('approved')}
        disabled={loading}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => handleDecision('denied')}
        disabled={loading}
        className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
      >
        Deny
      </button>
    </div>
  );
}
