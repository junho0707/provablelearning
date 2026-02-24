import { createClient } from '@/lib/supabase/server';
import NewClassForm from './form';

export default async function NewClassPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, subject')
    .order('start_date', { ascending: false });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New Class</h1>
      <NewClassForm courses={courses || []} />
    </div>
  );
}
