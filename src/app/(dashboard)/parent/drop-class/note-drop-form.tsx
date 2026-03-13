'use client';

import { useState } from 'react';
import { noteDropAction } from './actions';

export function NoteDropForm({ enrollmentId }: { enrollmentId: string }) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError('');
    const result = await noteDropAction(formData);
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

      <div className="bg-error-light border border-red-200 rounded-lg p-3">
        <p className="text-sm text-red-800 font-medium">
          This class will be dropped immediately. You will not be able to
          re-enroll in this section.
        </p>
      </div>

      <div>
        <label
          htmlFor={`note-${enrollmentId}`}
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          Leave a note for the admin
        </label>
        <textarea
          id={`note-${enrollmentId}`}
          name="note"
          required
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-navy-400 focus:ring-1 focus:ring-navy-400 outline-none"
          placeholder="Please let us know why you are dropping..."
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
