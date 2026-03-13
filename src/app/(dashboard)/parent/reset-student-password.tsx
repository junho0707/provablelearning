'use client';

import { useState, useTransition } from 'react';
import { resetStudentPasswordAction } from './reset-student-password-action';

export function ResetStudentPassword({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError('');
    setSuccess(false);
    startTransition(async () => {
      const result = await resetStudentPasswordAction(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={() => { setOpen(true); setSuccess(false); }}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Reset Password
        </button>
        {success && <span className="text-xs text-green-600">Password updated</span>}
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="mt-2 bg-gray-50 border rounded p-3 space-y-2">
      <p className="text-xs text-gray-600">Set a new password for {studentName}</p>
      <input type="hidden" name="student_id" value={studentId} />
      <input
        type="password"
        name="password"
        required
        minLength={6}
        placeholder="New password (min 6 chars)"
        className="w-full rounded border px-2 py-1.5 text-sm"
      />
      <input
        type="password"
        name="confirm_password"
        required
        minLength={6}
        placeholder="Confirm password"
        className="w-full rounded border px-2 py-1.5 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-black px-3 py-1.5 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? 'Updating...' : 'Update Password'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(''); }}
          className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
