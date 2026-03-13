'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function removeStudentAction(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  const adminClient = createAdminClient();

  // Verify parent owns this student
  const { data: student } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', studentId)
    .single();

  if (!student) return { error: 'Student not found.' };
  if (student.parent_id !== user.id) return { error: 'Not authorized.' };

  // Block removal if active/pending enrollments exist
  const { count } = await adminClient
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .in('status', ['pending', 'active']);

  if (count && count > 0) {
    return { error: 'Cannot remove a student with active enrollments. Drop all classes first.' };
  }

  // Block removal if active waitlist entries exist
  const { count: waitlistCount } = await adminClient
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .in('status', ['waiting', 'notified']);

  if (waitlistCount && waitlistCount > 0) {
    return { error: 'Cannot remove a student who is on a waitlist.' };
  }

  const studentUserId = student.user_id;

  // Delete in order: students → users → auth
  // students row has CASCADE on user_id, but we delete explicitly for clarity
  const { error: studentErr } = await adminClient
    .from('students')
    .delete()
    .eq('id', studentId);

  if (studentErr) return { error: studentErr.message };

  const { error: userErr } = await adminClient
    .from('users')
    .delete()
    .eq('id', studentUserId);

  if (userErr) return { error: userErr.message };

  const { error: authErr } = await adminClient.auth.admin.deleteUser(studentUserId);
  if (authErr) return { error: authErr.message };

  revalidatePath('/parent');
  return { success: true };
}
