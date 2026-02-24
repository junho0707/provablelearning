'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/stripe/prices';
import { enrollAction } from './actions';

interface Props {
  classId: string;
  courseId: string;
  students: Array<{ id: string; user: { full_name: string } }>;
  price: number;
  stripeEnabled: boolean;
}

export default function EnrollForm({ classId, courseId, students, price, stripeEnabled }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedAcademic, setAgreedAcademic] = useState(false);
  const [agreedRefund, setAgreedRefund] = useState(false);
  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError('');

    formData.set('class_id', classId);
    formData.set('course_id', courseId);
    formData.set('agreement_version', '1.0');
    formData.set('agreement_timestamp', new Date().toISOString());

    const result = await enrollAction(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.redirectTo) {
      // Always use full navigation (not router.push) to ensure
      // refreshed auth cookies from the server action are picked up
      window.location.href = result.redirectTo;
    }
  }

  const canSubmit = agreedAcademic && agreedRefund && !loading;

  if (students.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg">
        <p className="text-gray-600 mb-4">No students on your account.</p>
        <a
          href="/parent/add-child"
          className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
        >
          Add a Child First
        </a>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1">Select Student</label>
        <select name="student_id" required className="w-full rounded border px-3 py-2">
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.user?.full_name || 'Unknown'}
            </option>
          ))}
        </select>
      </div>

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
        className="w-full rounded bg-black py-3 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? 'Processing...' : stripeEnabled ? `Pay ${formatPrice(price)}` : 'Enroll Now'}
      </button>
    </form>
  );
}
