'use client';

import { useState, useRef } from 'react';
import { formatPrice } from '@/lib/stripe/prices';
import { acceptOfferAction } from './actions';

interface SlotInfo {
  id: string;
  name: string;
  meeting_day: string;
  meeting_time: string;
  hasCapacity: boolean;
}

interface Props {
  waitlistId: string;
  slots: SlotInfo[];
  price: number;
  offerExpiresAt: string;
  stripeEnabled: boolean;
  groupSizeType: string;
}

function formatTime12h(raw: string): string {
  const parts = raw.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m remaining`;
}

const SUBJECT_OPTIONS = [
  { value: 'dsat_rw', label: 'DSAT Reading & Writing' },
  { value: 'dsat_math', label: 'DSAT Math' },
  { value: 'dsat_rw_math', label: 'DSAT Reading, Writing & Math' },
  { value: 'general_math', label: 'School Math' },
];

export default function AcceptOfferForm({ waitlistId, slots, price, offerExpiresAt, stripeEnabled, groupSizeType }: Props) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedAcademic, setAgreedAcademic] = useState(false);
  const [agreedRefund, setAgreedRefund] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_later'>('pay_now');
  const [subjectCategory, setSubjectCategory] = useState('');
  const [subjectDetail, setSubjectDetail] = useState('');
  const submittingRef = useRef(false);

  const showSubjectPicker = groupSizeType !== 'large';
  const subjectValid = !showSubjectPicker || (subjectCategory && (subjectCategory !== 'general_math' || subjectDetail.trim()));
  const canSubmit = selectedSlots.length === 2 && agreedAcademic && agreedRefund && !loading && subjectValid;

  function toggleSlot(slotId: string) {
    setSelectedSlots((prev) => {
      if (prev.includes(slotId)) {
        return prev.filter((id) => id !== slotId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, slotId];
    });
  }

  async function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError('');

    formData.set('waitlist_id', waitlistId);
    formData.set('slot_1_class_id', selectedSlots[0]);
    formData.set('slot_2_class_id', selectedSlots[1]);
    formData.set('payment_choice', paymentChoice);
    if (subjectCategory) formData.set('subject_category', subjectCategory);
    if (subjectDetail) formData.set('subject_detail', subjectDetail);

    const result = await acceptOfferAction(formData);
    if (result?.error) {
      setError(result.error);
      submittingRef.current = false;
      setLoading(false);
    } else if (result?.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <p className="font-medium text-blue-900">Offer expires: {formatCountdown(offerExpiresAt)}</p>
        <p className="text-blue-700 mt-1">
          Expires {new Date(offerExpiresAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Select 2 time slots</label>
        <div className="space-y-2">
          {slots.map((slot) => {
            const selected = selectedSlots.includes(slot.id);
            const disabled = !slot.hasCapacity;
            return (
              <label
                key={slot.id}
                className={`flex items-center gap-3 border rounded p-3 ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-navy-50'
                } ${selected ? 'border-blue-500 bg-blue-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => !disabled && toggleSlot(slot.id)}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="font-medium text-sm">{slot.name || slot.meeting_day}</p>
                  <p className="text-xs text-slate-600">{slot.meeting_day} at {formatTime12h(slot.meeting_time)}</p>
                </div>
                {!slot.hasCapacity && (
                  <span className="text-xs text-error font-medium">Full</span>
                )}
              </label>
            );
          })}
        </div>
        {selectedSlots.length === 1 && (
          <p className="text-xs text-amber-600 mt-1">Select 1 more slot.</p>
        )}
      </div>

      {showSubjectPicker && (
        <div>
          <label className="block text-sm font-medium mb-2">Subject</label>
          <select
            value={subjectCategory}
            onChange={(e) => { setSubjectCategory(e.target.value); if (e.target.value !== 'general_math') setSubjectDetail(''); }}
            required
            className="w-full rounded border px-3 py-2 text-sm"
          >
            <option value="">Select a subject...</option>
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {subjectCategory === 'general_math' && (
            <input
              type="text"
              value={subjectDetail}
              onChange={(e) => setSubjectDetail(e.target.value)}
              placeholder="e.g., Algebra 2, Pre-Calculus"
              required
              className="mt-2 w-full rounded border px-3 py-2 text-sm"
            />
          )}
        </div>
      )}

      {selectedSlots.length === 2 && (
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <p className="font-medium mb-1">Schedule</p>
          {selectedSlots.map((sid, i) => {
            const s = slots.find((sl) => sl.id === sid);
            return s ? <p key={sid}>Slot {i + 1}: {s.meeting_day} at {formatTime12h(s.meeting_time)}</p> : null;
          })}
          <p className="text-slate-500 mt-1">Rolling enrollment — your month starts on enrollment date</p>
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
