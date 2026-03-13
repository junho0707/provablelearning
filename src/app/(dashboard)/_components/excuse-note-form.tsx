'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ExcuseNoteForm({
  cancellationId,
  deadline,
  submitAction,
}: {
  cancellationId: string;
  deadline: string;
  submitAction: (cancellationId: string, note: string) => Promise<{ error?: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const deadlineDate = new Date(deadline);
  const now = new Date();
  const isPastDeadline = deadlineDate <= now;

  if (isPastDeadline) {
    return <span className="text-slate-400 ml-1">— excuse deadline passed</span>;
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-amber-600 hover:underline ml-1"
      >
        Submit Excuse (due {deadlineDate.toLocaleDateString()})
      </button>
    );
  }

  async function handleSubmit() {
    if (!note.trim()) {
      setError('Please provide an excuse note.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await submitAction(cancellationId, note.trim());
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="mt-1.5 ml-4 space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full rounded border px-2 py-1 text-xs"
        placeholder="Please explain the absence..."
      />
      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Excuse'}
        </button>
        <button
          onClick={() => {
            setExpanded(false);
            setNote('');
            setError('');
          }}
          className="rounded border px-3 py-1 text-xs font-medium hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
