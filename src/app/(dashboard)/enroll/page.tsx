import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import ClassBrowser, { type ClassRow } from './_components/class-browser';

export default async function EnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ waitlisted?: string; error?: string }>;
}) {
  const { waitlisted, error: errorParam } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent' && profile?.role !== 'student') redirect(`/${profile?.role || ''}`);

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, capacity, active, class_start_date, class_end_date, enrollment_window_start, enrollment_window_end')
    .eq('active', true)
    .order('subject', { ascending: true })
    .order('meeting_day', { ascending: true });

  const allClasses = (classes || []) as ClassRow[];

  const today = new Date().toISOString().split('T')[0];
  const availableClasses = allClasses.filter((c) => {
    if (c.group_size_type === 'large') {
      return c.class_start_date && c.class_start_date > today;
    }
    return true;
  });

  const classIds = availableClasses.map((c) => c.id);
  const adminSupabase = createAdminClient();
  let enrollmentCounts: Record<string, number> = {};
  if (classIds.length > 0) {
    const { data: counts } = await adminSupabase
      .from('enrollments')
      .select('slot_1_class_id, slot_2_class_id, slot_3_class_id, class_id')
      .in('status', ['active', 'pending']);

    const countMap: Record<string, number> = {};
    (counts || []).forEach((row: Record<string, unknown>) => {
      const ids = new Set<string>();
      if (row.slot_1_class_id) ids.add(row.slot_1_class_id as string);
      if (row.slot_2_class_id) ids.add(row.slot_2_class_id as string);
      if (row.slot_3_class_id) ids.add(row.slot_3_class_id as string);
      if (row.class_id) ids.add(row.class_id as string);
      ids.forEach((id) => {
        if (classIds.includes(id)) {
          countMap[id] = (countMap[id] || 0) + 1;
        }
      });
    });
    enrollmentCounts = countMap;
  }

  const dashboardPath = profile?.role === 'parent' ? '/parent' : '/student';

  return (
    <div className="space-y-6">
      {/* Page header — flat style, matches /offerings */}
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Enroll</h1>
        <p className="text-slate-500">Pick 2 weekly time slots that work for you. You&apos;ll choose your subject on the next step.</p>
      </div>

      {waitlisted && (
        <div className="rounded-lg border border-green-200 bg-success-light px-4 py-3 text-sm">
          <p className="font-semibold text-green-800">You&apos;ve been added to the waitlist!</p>
          <p className="mt-1 text-green-700">
            We&apos;ll notify you when a spot opens up. Check your{' '}
            <a href={dashboardPath} className="font-medium underline hover:text-green-900">dashboard</a>{' '}
            for status updates.
          </p>
        </div>
      )}

      {errorParam && (
        <div className="rounded-lg border border-red-200 bg-error-light px-4 py-3 text-sm text-error">
          <p>{decodeURIComponent(errorParam)}</p>
        </div>
      )}

      {availableClasses.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <p className="text-slate-500">No slots available for enrollment right now.</p>
          <p className="mt-1 text-sm text-slate-400">Check back soon for new openings.</p>
        </div>
      ) : (
        <ClassBrowser classes={availableClasses} enrollmentCounts={enrollmentCounts} />
      )}
    </div>
  );
}
