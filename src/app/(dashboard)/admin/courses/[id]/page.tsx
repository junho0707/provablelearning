import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import EditCourseForm from './edit-form';

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single();

  if (!course) notFound();

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Edit Course</h1>
      <EditCourseForm course={course} />
    </div>
  );
}
