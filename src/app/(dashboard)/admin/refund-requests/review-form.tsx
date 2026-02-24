'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function ReviewForm({ requestId }: { requestId: string }) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleReview(status: 'approved' | 'denied') {
    if (submitting) return;
    setSubmitting(true);

    const supabase = createClient();
    await supabase
      .from('refund_requests')
      .update({
        status,
        admin_notes: notes.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2 items-end">
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Admin notes (optional)"
        className="flex-1 rounded border px-3 py-2 text-sm"
      />
      <button
        onClick={() => handleReview('approved')}
        disabled={submitting}
        className="rounded bg-green-600 px-4 py-2 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => handleReview('denied')}
        disabled={submitting}
        className="rounded bg-red-600 px-4 py-2 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
      >
        Deny
      </button>
    </div>
  );
}
