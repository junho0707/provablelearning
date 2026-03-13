'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function DeleteMessageButton({ messageId }: { messageId: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from('messages').delete().eq('id', messageId);
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-gray-300 hover:text-red-500 text-xs ml-2 disabled:opacity-50"
      title="Delete message"
    >
      {deleting ? '...' : '✕'}
    </button>
  );
}
