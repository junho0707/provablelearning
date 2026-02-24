'use server';

import { createClient } from '@/lib/supabase/server';
import { createCourseSchema, updateCourseSchema } from '@/lib/validators/course';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createCourse(formData: FormData) {
  const supabase = await createClient();

  const parsed = createCourseSchema.safeParse({
    subject: formData.get('subject'),
    level: formData.get('level'),
    name: formData.get('name'),
    start_date: formData.get('start_date'),
    end_date: formData.get('end_date'),
    max_reenroll: Number(formData.get('max_reenroll') || 3),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase.from('courses').insert(parsed.data);

  if (error) {
    if (error.message.includes('overlap')) {
      return { error: 'Course dates overlap with an existing course for this subject.' };
    }
    return { error: error.message };
  }

  revalidatePath('/admin/courses');
  redirect('/admin/courses');
}

export async function updateCourse(formData: FormData) {
  const supabase = await createClient();

  const parsed = updateCourseSchema.safeParse({
    id: formData.get('id'),
    subject: formData.get('subject') || undefined,
    level: formData.get('level') || undefined,
    name: formData.get('name') || undefined,
    start_date: formData.get('start_date') || undefined,
    end_date: formData.get('end_date') || undefined,
    max_reenroll: formData.get('max_reenroll') ? Number(formData.get('max_reenroll')) : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { id, ...updates } = parsed.data;
  const { error } = await supabase.from('courses').update(updates).eq('id', id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/admin/courses');
  redirect('/admin/courses');
}

export async function deleteCourse(id: string) {
  const supabase = await createClient();

  // Check for active enrollments
  const { count } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', id)
    .in('status', ['pending', 'active']);

  if (count && count > 0) {
    return { error: 'Cannot delete course with active enrollments.' };
  }

  const { error } = await supabase.from('courses').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin/courses');
  redirect('/admin/courses');
}
