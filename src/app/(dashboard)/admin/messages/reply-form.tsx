'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function AdminReplyForm({ toUserId }: { toUserId: string }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;

    setSending(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from('messages').insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      body: body.trim(),
    });

    setSending(false);
    if (!error) {
      setBody('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Reply..."
        maxLength={2000}
        className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
      <button
        type="submit"
        disabled={sending || !body.trim()}
        className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {sending ? '...' : 'Reply'}
      </button>
    </form>
  );
}
