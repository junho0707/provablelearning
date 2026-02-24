'use client';

import { useState } from 'react';
import { deleteClass } from '../actions';

export function DeleteClassButton({ classId }: { classId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setSubmitting(true);
    setError('');
    const result = await deleteClass(classId);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-600">Delete this class?</span>
        <button
          onClick={handleDelete}
          disabled={submitting}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Deleting...' : 'Confirm Delete'}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(''); }}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setConfirming(true)}
        className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete Class
      </button>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  );
}
