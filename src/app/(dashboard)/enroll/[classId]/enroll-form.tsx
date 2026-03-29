'use client';

import { useState, useRef, useMemo } from 'react';
import { formatPrice } from '@/lib/stripe/prices';
import { enrollAction } from './actions';

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/** Compute all dates matching the given meeting day(s) within [start, end]. */
function getValidStartDates(
  windowStart: string,
  windowEnd: string,
  meetingDays: string[]
): string[] {
  const targetDows = meetingDays.map((d) => DAY_INDEX[d]).filter((n) => n !== undefined);
  if (targetDows.length === 0) return [];

  const dates: string[] = [];
  const cursor = new Date(windowStart + 'T00:00:00');
  const end = new Date(windowEnd + 'T00:00:00');

  while (cursor <= end) {
    if (targetDows.includes(cursor.getDay())) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatDateLabel(dateStr: string, meetingDay: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

interface Props {
  slot1ClassId: string;
  slot2ClassId: string | null;
  students: Array<{ id: string; user: { full_name: string } }>;
  price: number;
  stripeEnabled: boolean;
  groupSizeType: string;
  slot1Label: string;
  slot2Label?: string;
  enrollmentWindowStart?: string;
  enrollmentWindowEnd?: string;
  slot1MeetingDay?: string;
  slot2MeetingDay?: string;
}

const SUBJECT_OPTIONS = [
  { value: 'dsat_rw', label: 'DSAT Reading & Writing' },
  { value: 'dsat_math', label: 'DSAT Math' },
  { value: 'dsat_rw_math', label: 'DSAT Reading, Writing & Math' },
  { value: 'general_math', label: 'School Math' },
] as const;

export default function EnrollForm({ slot1ClassId, slot2ClassId, students, price, stripeEnabled, groupSizeType, slot1Label, slot2Label, enrollmentWindowStart, enrollmentWindowEnd, slot1MeetingDay, slot2MeetingDay }: Props) {
  const [error, setError] = useState('');
  const [waitlistedMsg, setWaitlistedMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedAcademic, setAgreedAcademic] = useState(false);
  const [agreedRefund, setAgreedRefund] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_later'>('pay_now');
  const [subjectCategory, setSubjectCategory] = useState('');
  const [subjectDetail, setSubjectDetail] = useState('');
  const showSubjectPicker = groupSizeType !== 'large';
  const showStartDatePicker = groupSizeType !== 'large' && !!(enrollmentWindowStart && enrollmentWindowEnd);
  const submittingRef = useRef(false);

  // Compute valid start dates (only meeting days within the window)
  const validDates = useMemo(() => {
    if (!showStartDatePicker || !enrollmentWindowStart || !enrollmentWindowEnd) return [];
    // Only use slot 1's meeting day for start dates — sessions for both slots
    // are computed from this start date
    const days = [slot1MeetingDay].filter(Boolean) as string[];
    if (days.length === 0) return [];
    return getValidStartDates(enrollmentWindowStart, enrollmentWindowEnd, days);
  }, [showStartDatePicker, enrollmentWindowStart, enrollmentWindowEnd, slot1MeetingDay]);

  const [startDate, setStartDate] = useState(validDates[0] || '');

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');

    formData.set('slot_1_class_id', slot1ClassId);
    if (slot2ClassId) formData.set('slot_2_class_id', slot2ClassId);
    formData.set('agreement_version', '1.0');
    formData.set('agreement_timestamp', new Date().toISOString());
    formData.set('payment_choice', paymentChoice);
    if (startDate) formData.set('student_start_date', startDate);
    if (subjectCategory) formData.set('subject_category', subjectCategory);
    if (subjectDetail) formData.set('subject_detail', subjectDetail);

    const result = await enrollAction(formData) as { error?: string; redirectTo?: string; waitlisted?: boolean; message?: string };
    if (result?.waitlisted) {
      setWaitlistedMsg(result.message || 'You have been added to the waitlist.');
      submittingRef.current = false;
      setLoading(false);
    } else if (result?.error) {
      setError(result.error);
      submittingRef.current = false;
      setLoading(false);
    } else if (result?.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  const subjectValid = !showSubjectPicker || (!!subjectCategory && (subjectCategory !== 'general_math' || !!subjectDetail));
  const canSubmit = agreedAcademic && agreedRefund && !loading && (!showStartDatePicker || !!startDate) && subjectValid;

  if (students.length === 0) {
    return (
      <div className="text-center py-8 border border-slate-200 rounded-xl">
        <p className="text-slate-600 mb-4">No students on your account.</p>
        <a
          href="/parent/add-student"
          className="rounded bg-navy-900 px-4 py-2 text-white text-sm font-medium hover:bg-navy-800"
        >
          Add a Student First
        </a>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}

      {waitlistedMsg && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">{waitlistedMsg}</p>
          <a href="/parent" className="underline text-amber-700 hover:text-amber-900">Go to Dashboard</a>
        </div>
      )}

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

      {showSubjectPicker && (
        <div>
          <label className="block text-sm font-medium mb-1">What will you be studying?</label>
          <select
            value={subjectCategory}
            onChange={(e) => {
              setSubjectCategory(e.target.value);
              if (e.target.value !== 'general_math') setSubjectDetail('');
            }}
            required
            className="w-full rounded border px-3 py-2"
          >
            <option value="">Select subject...</option>
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {subjectCategory === 'general_math' && (
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">Which math class or subject?</label>
              <input
                type="text"
                value={subjectDetail}
                onChange={(e) => setSubjectDetail(e.target.value)}
                placeholder="e.g. Algebra 2, Precalculus, AP Calculus..."
                required
                className="w-full rounded border px-3 py-2"
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-50 rounded-lg p-3 text-sm">
        <p className="font-medium mb-1">Schedule</p>
        <p>Slot 1: {slot1Label}</p>
        {slot2Label && <p>Slot 2: {slot2Label}</p>}
        {groupSizeType !== 'large' && !showStartDatePicker && (
          <p className="text-slate-500 mt-1">Rolling enrollment — your month starts on enrollment date</p>
        )}
        {showStartDatePicker && startDate && (
          <p className="text-slate-500 mt-1">Your first session: {formatDateLabel(startDate, slot1MeetingDay || '')}</p>
        )}
      </div>

      {showStartDatePicker && (
        <div>
          <label className="block text-sm font-medium mb-1">Choose Your Start Date</label>
          {validDates.length > 0 ? (
            <select
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded border px-3 py-2"
            >
              {validDates.map((d) => (
                <option key={d} value={d}>
                  {formatDateLabel(d, slot1MeetingDay || '')}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-slate-500">No available start dates in the enrollment window.</p>
          )}
          <p className="text-xs text-slate-500 mt-1">
            Your sessions will begin on this date and continue weekly for one month.
          </p>
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

      {stripeEnabled && (
        <div className="border rounded p-4 space-y-3">
          <h3 className="font-medium">Payment Option</h3>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="payment_choice"
              value="pay_now"
              checked={paymentChoice === 'pay_now'}
              onChange={() => setPaymentChoice('pay_now')}
              className="mt-0.5"
            />
            <span>
              <strong>Pay Now</strong> — proceed to payment ({formatPrice(price)})
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="payment_choice"
              value="pay_later"
              checked={paymentChoice === 'pay_later'}
              onChange={() => setPaymentChoice('pay_later')}
              className="mt-0.5"
            />
            <span>
              <strong>Pay Later</strong> — enroll now, pay before the deadline
            </span>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded bg-navy-900 py-3 text-white font-medium hover:bg-navy-800 disabled:opacity-50"
      >
        {loading
          ? 'Processing...'
          : stripeEnabled
          ? paymentChoice === 'pay_later'
            ? 'Enroll Now (Pay Later)'
            : `Pay ${formatPrice(price)}`
          : 'Enroll Now'}
      </button>
    </form>
  );
}
