import { createClient } from '@/lib/supabase/server';
import PerformanceForm from './form';

export default async function AdminPerformancePage() {
  const supabase = await createClient();

  // Get active classes with their courses
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time')
    .eq('active', true)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Performance Logging</h1>
        <p className="text-slate-500">Log attendance and homework completion per session.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <PerformanceForm classes={(classes || []) as unknown as Array<{ id: string; name: string | null; subject: string | null; level: string | null; group_size_type: string; meeting_day: string; meeting_time: string }>} />
      </div>
    </div>
  );
}
