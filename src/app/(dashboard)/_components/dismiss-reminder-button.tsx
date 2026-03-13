'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface DismissReminderButtonProps {
  /** If provided, marks this notification as read in the DB on dismiss */
  notificationId?: string;
  /** Called after dismiss is confirmed (for local state removal) */
  onDismissed?: () => void;
}

export function DismissReminderButton({ notificationId, onDismissed }: DismissReminderButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    if (notificationId) {
      const supabase = createClient();
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);
    }
    onDismissed?.();
    setLoading(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="text-[11px] text-slate-500">Dismiss?</span>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          Yes
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-slate-300 hover:text-slate-500 shrink-0 p-0.5"
      title="Dismiss reminder"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
