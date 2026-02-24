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
        className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
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
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Reason for dropping
        </label>
        <textarea
          id={`reason-${enrollmentId}`}
          name="reason"
          required
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Please explain why you are dropping this class..."
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Dropping...' : 'Confirm Drop'}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError('');
          }}
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
