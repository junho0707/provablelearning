'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePreferredSlotsAction } from './waitlist-actions';
import { formatTime } from '@/lib/constants';

interface SlotInfo {
  id: string;
  name: string | null;
  meeting_day: string;
  meeting_time: string;
}

interface Props {
  waitlistId: string;
  currentSlotIds: string[];
  availableSlots: SlotInfo[];
}

export function EditPreferredSlotsForm({ waitlistId, currentSlotIds, availableSlots }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentSlotIds));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleSlot(slotId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    setError('');
    const result = await updatePreferredSlotsAction(waitlistId, [...selectedIds]);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setSelectedIds(new Set(currentSlotIds));
          setEditing(true);
        }}
        className="text-blue-500 hover:text-blue-700 hover:underline text-xs ml-1"
      >
        Edit Slots
      </button>
    );
  }

  return (
    <div className="mt-2 border rounded p-3 bg-white space-y-2">
      <p className="text-xs font-medium text-slate-600">Select preferred slots (min 2):</p>
      <div className="space-y-1">
        {availableSlots.map((slot) => (
          <label
            key={slot.id}
            className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer hover:bg-navy-50 ${
              selectedIds.has(slot.id) ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(slot.id)}
              onChange={() => toggleSlot(slot.id)}
              className="h-3 w-3"
            />
            {slot.meeting_day} at {formatTime(slot.meeting_time)}
          </label>
        ))}
      </div>
      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={submitting || selectedIds.size < 2}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : `Save (${selectedIds.size} selected)`}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs px-2 py-1 rounded border hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
