'use client';

import { useState } from 'react';
import { joinWaitlistAction } from './actions';
import { formatTime } from '@/lib/constants';

interface SlotInfo {
  id: string;
  name: string | null;
  meeting_day: string;
  meeting_time: string;
  full: boolean;
}

interface Props {
  slots: SlotInfo[];
  students: Array<{ id: string; user: { full_name: string } }>;
  groupSizeType: string;
  preSelectedIds?: string[];
  /** How many slots the student needs (e.g. 2 for SG/1:1) */
  requiredSlots?: number;
}

export default function SgWaitlistForm({ slots, students, groupSizeType, preSelectedIds, requiredSlots = 2 }: Props) {
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(
    new Set(preSelectedIds || [])
  );
  const [agreedAcademic, setAgreedAcademic] = useState(false);
  const [agreedRefund, setAgreedRefund] = useState(false);
  const [loading, setLoading] = useState(false);

  const gsLabel = groupSizeType === 'one_on_one' ? '1:1' : 'Small Group';
  const canSubmit = selectedSlotIds.size >= requiredSlots && agreedAcademic && agreedRefund && !loading;

  const maxSlots = 4;

  function toggleSlot(slotId: string) {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) {
        next.delete(slotId);
      } else if (next.size < maxSlots) {
        next.add(slotId);
      }
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    formData.set('group_size_type', groupSizeType);
    formData.set('preferred_class_ids', JSON.stringify([...selectedSlotIds]));
    formData.set('agreement_version', '1.0');
    formData.set('agreement_timestamp', new Date().toISOString());
    await joinWaitlistAction(formData);
    setLoading(false);
  }

  const locked = preSelectedIds && preSelectedIds.length >= requiredSlots;
  const selectedSlots = slots.filter((s) => selectedSlotIds.has(s.id));

  return (
    <div className="py-8">
      <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-amber-50 text-sm text-amber-800">
        You&apos;ll be notified when {requiredSlots} of your selected slots have openings and given 3 days to accept.
      </div>

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

        {locked ? (
          <div>
            <h3 className="font-medium mb-2">Your preferred time slots:</h3>
            <div className="space-y-2">
              {selectedSlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 border border-blue-500 bg-blue-50 rounded p-3"
                >
                  <span className="text-blue-600 font-bold text-sm">&#10003;</span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{slot.name || slot.meeting_day}</p>
                    <p className="text-xs text-slate-600">{slot.meeting_day} at {formatTime(slot.meeting_time)}</p>
                  </div>
                  {slot.full && (
                    <span className="text-xs text-red-500 font-medium">Full</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h3 className="font-medium mb-2">Select your preferred time slots:</h3>
            <div className="space-y-2">
              {slots.map((slot) => (
                <label
                  key={slot.id}
                  className={`flex items-center gap-3 border rounded p-3 cursor-pointer hover:bg-navy-50 ${
                    selectedSlotIds.has(slot.id) ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSlotIds.has(slot.id)}
                    onChange={() => toggleSlot(slot.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{slot.name || slot.meeting_day}</p>
                    <p className="text-xs text-slate-600">{slot.meeting_day} at {formatTime(slot.meeting_time)}</p>
                  </div>
                  {slot.full && (
                    <span className="text-xs text-error font-medium">Currently full</span>
                  )}
                </label>
              ))}
            </div>
            {selectedSlotIds.size > 0 && selectedSlotIds.size < requiredSlots && (
              <p className="text-xs text-amber-600 mt-1">Select at least {requiredSlots - selectedSlotIds.size} more slot{requiredSlots - selectedSlotIds.size !== 1 ? 's' : ''}.</p>
            )}
            {selectedSlotIds.size >= maxSlots && (
              <p className="text-xs text-slate-500 mt-1">Maximum of {maxSlots} slots reached.</p>
            )}
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
          className="w-full rounded border px-6 py-2 font-medium hover:bg-navy-50 disabled:opacity-50"
        >
          {loading ? 'Joining...' : `Join Waitlist (${selectedSlotIds.size} slot${selectedSlotIds.size !== 1 ? 's' : ''} selected)`}
        </button>
      </form>
    </div>
  );
}
