'use client';

import { useState } from 'react';
import { syncMeetLink } from '../actions';
import { useRouter } from 'next/navigation';

export function SyncMeetLinkButton({ classId }: { classId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setMsg('');
    const result = await syncMeetLink(classId);
    if (result.error) {
      setMsg(result.error);
    } else if (result.meetLink) {
      setMsg('Synced!');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Syncing...' : 'Sync from Calendar'}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </span>
  );
}
