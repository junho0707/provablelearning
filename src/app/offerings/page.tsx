import Link from 'next/link';
import { ServerNav } from '@/components/server-nav';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNavProps } from '@/lib/auth/get-nav-props';
import OfferingsGrid from './offerings-grid';

export const revalidate = 60;

export interface OfferingClassRow {
  id: string;
  name: string | null;
  subject: string | null;
  level: string | null;
  group_size_type: string;
  meeting_day: string;
  meeting_time: string;
  meeting_day_2: string | null;
  meeting_time_2: string | null;
  capacity: number;
  active: boolean;
  class_start_date: string | null;
  class_end_date: string | null;
}

export default async function OfferingsPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const navProps = await getNavProps();
  const userRole = navProps.userRole;

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, capacity, active, class_start_date, class_end_date')
    .eq('active', true)
    .neq('group_size_type', 'large')
    .order('subject', { ascending: true })
    .order('meeting_day', { ascending: true });

  const availableClasses = (classes || []) as OfferingClassRow[];

  const classIds = availableClasses.map((c) => c.id);
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

  return (
    <main className="min-h-screen bg-navy-50">
      <ServerNav {...navProps} />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Class Schedule</h1>
          <p className="text-slate-500">
            Pick 2 weekly time slots that fit your schedule. Choose your subject when you enroll.
          </p>
        </div>

        {availableClasses.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
            <p className="text-slate-500">No slots available right now.</p>
            <p className="mt-1 text-sm text-slate-400">Check back soon for new openings.</p>
          </div>
        ) : (
          <OfferingsGrid classes={availableClasses} enrollmentCounts={enrollmentCounts} />
        )}

        {/* CTA card */}
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-10 text-center">
          {userRole === 'parent' || userRole === 'student' ? (
            <>
              <h2 className="mb-2 text-xl font-bold text-navy-900">Ready to enroll?</h2>
              <p className="mb-6 text-sm text-slate-500">Select your slots and get started today.</p>
              <Link
                href="/enroll"
                className="inline-block rounded-xl bg-navy-900 px-10 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-800"
              >
                Browse &amp; Enroll
              </Link>
            </>
          ) : userRole === 'admin' ? (
            <>
              <h2 className="mb-2 text-xl font-bold text-navy-900">Admin Dashboard</h2>
              <p className="mb-6 text-sm text-slate-500">Manage classes, students, and enrollment.</p>
              <Link
                href="/admin/classes"
                className="inline-block rounded-xl bg-navy-900 px-10 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-800"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-bold text-navy-900">Ready to enroll?</h2>
              <p className="mb-6 text-sm text-slate-500">Create an account or log in to reserve your spot.</p>
              <div className="flex justify-center gap-4">
                <Link
                  href="/login"
                  className="inline-block rounded-xl bg-navy-900 px-10 py-3 text-sm font-semibold text-white shadow-sm hover:bg-navy-800"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="inline-block rounded-xl border border-navy-200 px-10 py-3 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                >
                  Create Account
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy-950 px-6 py-10 text-center">
        <p className="text-sm text-navy-400">
          &copy; {new Date().getFullYear()} Provable Learning. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
