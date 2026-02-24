'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function linkStudentToParent(formData: FormData) {
  const supabase = await createClient();

  const studentId = formData.get('student_id') as string;
  const parentId = (formData.get('parent_id') as string) || null;

  const { error } = await supabase
    .from('students')
    .update({ parent_id: parentId })
    .eq('id', studentId);

  if (error) return { error: error.message };

  revalidatePath('/admin/students');
}
