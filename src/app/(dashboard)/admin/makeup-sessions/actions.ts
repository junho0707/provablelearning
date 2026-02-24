'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createMakeupSessionSchema, updateMakeupSessionSchema } from '@/lib/validators/makeup-session';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createMakeupSession(formData: FormData) {
  const supabase = await createClient();

  const parsed = createMakeupSessionSchema.safeParse({
    subject: formData.get('subject'),
    level: formData.get('level'),
    group_size_type: formData.get('group_size_type'),
    session_date: formData.get('session_date'),
    session_time: formData.get('session_time'),
    capacity: Number(formData.get('capacity')),
    google_meet_link: formData.get('google_meet_link') || null,
    location: formData.get('location') || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from('makeup_sessions')
    .insert(parsed.data);

  if (error) {
    if (error.message.includes('uq_makeup_session_subject_level_gst_date_time') || error.message.includes('uq_makeup_session_subject_level_date_time')) {
      return { error: 'A makeup session with this subject, level, group size, date, and time already exists.' };
    }
    return { error: error.message };
  }

  revalidatePath('/admin/makeup-sessions');
  redirect('/admin/makeup-sessions');
}

export async function updateMakeupSession(formData: FormData) {
  const supabase = await createClient();

  const parsed = updateMakeupSessionSchema.safeParse({
    id: formData.get('id'),
    subject: formData.get('subject') || undefined,
    level: formData.get('level') || undefined,
    group_size_type: formData.get('group_size_type') || undefined,
    session_date: formData.get('session_date') || undefined,
    session_time: formData.get('session_time') || undefined,
    capacity: formData.get('capacity') ? Number(formData.get('capacity')) : undefined,
    google_meet_link: formData.get('google_meet_link') || undefined,
    location: formData.get('location') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, ...updates } = parsed.data;

  // If reducing capacity, check booked count
  if (updates.capacity !== undefined) {
    const adminClient = createAdminClient();
    const { count } = await adminClient
      .from('makeup_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('makeup_session_id', id)
      .eq('status', 'booked');

    if (count && updates.capacity < count) {
      return { error: `Cannot reduce capacity below booked count (${count}).` };
    }
  }

  const { error } = await supabase
    .from('makeup_sessions')
    .update(updates)
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/makeup-sessions');
  redirect('/admin/makeup-sessions');
}

export async function deleteMakeupSession(sessionId: string): Promise<{ error?: string }> {
  const adminClient = createAdminClient();

  // Check for booked bookings
  const { count: bookedCount } = await adminClient
    .from('makeup_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('makeup_session_id', sessionId)
    .eq('status', 'booked');

  if (bookedCount && bookedCount > 0) {
    return { error: `Cannot delete: ${bookedCount} active booking(s) exist. Cancel them first.` };
  }

  // Clean up waitlist entries
  await adminClient
    .from('makeup_waitlist')
    .delete()
    .eq('makeup_session_id', sessionId);

  // Clean up cancelled/completed bookings
  await adminClient
    .from('makeup_bookings')
    .delete()
    .eq('makeup_session_id', sessionId);

  const { error } = await adminClient
    .from('makeup_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) return { error: error.message };

  revalidatePath('/admin/makeup-sessions');
  redirect('/admin/makeup-sessions');
}
