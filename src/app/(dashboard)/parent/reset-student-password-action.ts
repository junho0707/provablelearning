'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function resetStudentPasswordAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  const studentId = formData.get('student_id') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirm_password') as string;

  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const adminSupabase = createAdminClient();

  // Verify this student belongs to the current parent
  const { data: student } = await adminSupabase
    .from('students')
    .select('user_id, parent_id')
    .eq('id', studentId)
    .single();

  if (!student || student.parent_id !== user.id) {
    return { error: 'Not authorized.' };
  }

  if (!student.user_id) {
    return { error: 'This student does not have an account yet.' };
  }

  // Reset the password via admin API
  const { error } = await adminSupabase.auth.admin.updateUserById(student.user_id, {
    password,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
