'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function addStudentAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  // Verify current user is a parent
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'parent') {
    return { error: 'Only parents can add students.' };
  }

  const fullName = (formData.get('full_name') as string)?.trim();
  const gradeLevel = formData.get('grade_level') as string;
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirm_password') as string;

  if (!fullName) return { error: 'Student name is required.' };
  if (!gradeLevel) return { error: 'Grade level is required.' };
  if (!email) return { error: 'Email is required.' };
  if (!password) return { error: 'Password is required.' };

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  const grade = parseInt(gradeLevel, 10);
  if (isNaN(grade) || grade < 6 || grade > 12) {
    return { error: 'Grade level must be between 6 and 12.' };
  }

  const adminSupabase = createAdminClient();

  // Check if email is already used by another student
  {
    const { data: existingStudent, error: emailCheckErr } = await adminSupabase
      .from('students')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (!emailCheckErr && existingStudent) {
      return { error: 'A student with this email already exists.' };
    }
  }

  // Prevent duplicate: check if parent already has a student with this exact name
  {
    const { data: existingStudents, error: checkErr } = await adminSupabase
      .from('students')
      .select('id, full_name')
      .eq('parent_id', user.id);

    if (!checkErr) {
      const duplicate = existingStudents?.some(
        (c: Record<string, unknown>) => (c.full_name as string)?.toLowerCase() === fullName.toLowerCase()
      );
      if (duplicate) {
        return { error: 'A student with this name already exists.' };
      }
    }
  }

  // Create the auth user with email+password
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { error: 'An account with this email already exists.' };
    }
    return { error: authError.message };
  }

  const authId = authData.user.id;

  // Insert public.users row
  const { error: usersError } = await adminSupabase
    .from('users')
    .insert({
      id: authId,
      role: 'student',
      full_name: fullName,
      phone: null,
    });

  if (usersError) {
    // Rollback: delete the auth user
    await adminSupabase.auth.admin.deleteUser(authId);
    return { error: usersError.message };
  }

  // Insert students row
  const { error: studentError } = await adminSupabase
    .from('students')
    .insert({
      user_id: authId,
      parent_id: user.id,
      grade_level: grade,
      active_status: 'active',
      email,
      full_name: fullName,
    });

  if (studentError) {
    // Rollback: delete users row and auth user
    await adminSupabase.from('users').delete().eq('id', authId);
    await adminSupabase.auth.admin.deleteUser(authId);
    return { error: studentError.message };
  }

  revalidatePath('/parent');
  redirect('/parent');
}
