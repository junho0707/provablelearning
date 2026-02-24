'use client';

import { useState, useTransition } from 'react';
import { removeChildAction } from './remove-child-action';

export function RemoveChildButton({
  studentId,
  childName,
  hasActiveEnrollments,
}: {
  studentId: string;
  childName: string;
  hasActiveEnrollments: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  if (hasActiveEnrollments) {
    return (
      <p className="text-xs text-gray-400">
        Drop all classes before removing
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-red-500 hover:text-red-700 hover:underline"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">Remove {childName}?</span>
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError('');
            const result = await removeChildAction(studentId);
            if (result?.error) {
              setError(result.error);
            }
          });
        }}
        className="text-xs rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? 'Removing...' : 'Confirm'}
      </button>
      <button
        onClick={() => {
          setConfirming(false);
          setError('');
        }}
        className="text-xs rounded border px-2 py-1 hover:bg-gray-50"
      >
        Cancel
      </button>
    </div>
  );
}
