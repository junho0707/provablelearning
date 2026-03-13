'use client';

import { useState } from 'react';
import { dropClassAction } from './actions';

export function DropClassForm({ enrollmentId }: { enrollmentId: string }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError('');
    const result = await dropClassAction(formData);
    if (result?.error) {
      setError(result.error);
    }
    setSubmitting(false);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-error-light transition-colors"
      >
        Drop This Class
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="enrollment_id" value={enrollmentId} />
      <div>
        <label
          htmlFor={`reason-${enrollmentId}`}
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Reason for dropping
        </label>
        <textarea
          id={`reason-${enrollmentId}`}
          name="reason"
          required
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
          placeholder="Please explain why you are dropping this class..."
        />
      </div>

      {error && (
        <div className="bg-error-light border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Dropping...' : 'Confirm Drop'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError('');
          }}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-navy-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
