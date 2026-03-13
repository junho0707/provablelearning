'use client';

import { useState } from 'react';
import { DismissReminderButton } from './dismiss-reminder-button';

export interface ReminderItem {
  id: string;
  type: 'consultation' | 'makeup';
  message: string;
  meetLink?: string | null;
  meetingType?: string;
  /** DB notification id — if set, dismiss marks it as read */
  notificationId?: string;
}

export function RemindersList({ reminders: initial }: { reminders: ReminderItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = initial.filter((r) => !dismissed.has(r.id));

  if (visible.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          Reminders
        </h2>
      </div>
      <div className="divide-y divide-slate-50">
        {visible.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-5 py-3">
            <span className={`w-2 h-2 rounded-full shrink-0 ${r.type === 'consultation' ? 'bg-navy-500' : 'bg-blue-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-navy-900">{r.message}</p>
            </div>
            {r.type === 'consultation' && r.meetLink && r.meetingType !== 'phone' && (
              <a
                href={r.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-navy-900 px-3 py-1.5 text-white text-xs font-medium hover:bg-navy-800 shrink-0"
              >
                Join
              </a>
            )}
            <DismissReminderButton
              notificationId={r.notificationId}
              onDismissed={() => setDismissed((prev) => new Set(prev).add(r.id))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
