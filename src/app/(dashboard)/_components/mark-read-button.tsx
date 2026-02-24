'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();

  async function handleClick() {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
    >
      Dismiss
    </button>
  );
}
