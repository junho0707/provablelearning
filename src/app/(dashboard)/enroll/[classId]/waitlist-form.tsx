'use client';

import { useState } from 'react';
import { joinWaitlistAction } from './actions';

interface Props {
  classId: string;
  students: Array<{ id: string; user: { full_name: string } }>;
}

export default function WaitlistForm({ classId, students }: Props) {
  const [agreedAcademic, setAgreedAcademic] = useState(false);
  const [agreedRefund, setAgreedRefund] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = agreedAcademic && agreedRefund && !loading;

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set('class_id', classId);
    formData.set('agreement_version', '1.0');
    formData.set('agreement_timestamp', new Date().toISOString());
    await joinWaitlistAction(formData);
    setLoading(false);
  }

  return (
    <div className="py-8">
      <p className="text-gray-600 mb-4">This class is currently full.</p>
      <p className="text-sm text-gray-500 mb-4">
        Join the waitlist and you will be automatically enrolled when a seat opens.
      </p>
      <form action={handleSubmit} className="space-y-4">
        {students.length === 1 ? (
          <>
            <input type="hidden" name="student_id" value={students[0].id} />
            <p className="text-sm text-gray-700">
              Joining waitlist for <span className="font-medium">{students[0].user.full_name}</span>
            </p>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1">Select Student</label>
            <select name="student_id" required className="w-full rounded border px-3 py-2">
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.user.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="border rounded p-4 space-y-3">
          <h3 className="font-medium">Agreements</h3>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreedAcademic}
              onChange={(e) => setAgreedAcademic(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I have read and agree to the <strong>Academic Policy</strong>, including
              homework requirements, attendance expectations, and conduct standards.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreedRefund}
              onChange={(e) => setAgreedRefund(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I have read and agree to the <strong>Refund & Cancellation Policy</strong>.
              Credits may be issued per the policy terms.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded border px-6 py-2 font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Joining...' : 'Join Waitlist'}
        </button>
      </form>
    </div>
  );
}
