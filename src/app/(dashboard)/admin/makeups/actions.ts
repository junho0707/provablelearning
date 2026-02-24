'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function reviewMakeupRequest(params: {
  logId: string;
  decision: 'approved' | 'denied';
  adminNote?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  // Fetch the original makeup request
  const { data: log } = await supabase
    .from('admin_logs')
    .select('id, metadata_json')
    .eq('id', params.logId)
    .eq('action', 'student_makeup_request')
    .single();

  if (!log) return { error: 'Makeup request not found.' };

  const metadata = log.metadata_json as Record<string, unknown>;
  if (metadata.status !== 'pending_review') {
    return { error: 'This request has already been reviewed.' };
  }

  // Log the admin decision
  await supabase.from('admin_logs').insert({
    admin_id: user.id,
    action: 'makeup_request_reviewed',
    metadata_json: {
      original_log_id: params.logId,
      student_id: metadata.student_id,
      course_id: metadata.course_id,
      session_number: metadata.session_number,
      decision: params.decision,
      admin_note: params.adminNote || null,
      reviewed_at: new Date().toISOString(),
    },
  });

  revalidatePath('/admin/makeups');
  return { success: true };
}
