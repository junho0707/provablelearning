import { createClient } from '@/lib/supabase/server';
import PerformanceForm from './form';

export default async function AdminPerformancePage() {
  const supabase = await createClient();

  // Get active classes with their courses
  const { data: classes } = await supabase
    .from('classes')
    .select('id, group_size_type, meeting_day, meeting_time, courses(id, name, subject)')
    .eq('active', true)
    .order('created_at', { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Performance Logging</h1>
      <p className="text-gray-600 mb-4">
        Log attendance and homework completion per class per session.
      </p>
      <PerformanceForm classes={(classes || []) as unknown as Array<{ id: string; group_size_type: string; meeting_day: string; meeting_time: string; courses: { id: string; name: string; subject: string } }>} />
    </div>
  );
}
