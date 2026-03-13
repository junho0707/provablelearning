'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateBookingWindow(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return { error: 'Not authorized' };

  const windowStart = formData.get('window_start') as string || null;
  const windowEnd = formData.get('window_end') as string || null;

  if (windowStart && windowEnd && windowStart > windowEnd) {
    return { error: 'Start date must be before or equal to end date.' };
  }

  const { error } = await supabase
    .from('booking_window')
    .update({
      window_start: windowStart || null,
      window_end: windowEnd || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);

  if (error) return { error: error.message };

  revalidatePath('/admin/bookings');
  return { success: true };
}
