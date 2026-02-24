'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function MessageForm({ tutorId }: { tutorId: string }) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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
      to_user_id: tutorId,
      body: body.trim(),
    });

    setSending(false);
    if (!error) {
      setBody('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type a message..."
        maxLength={2000}
        className="flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />
      <button
        type="submit"
        disabled={sending || !body.trim()}
        className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
      {sent && <span className="text-sm text-green-600 self-center">Sent!</span>}
    </form>
  );
}
