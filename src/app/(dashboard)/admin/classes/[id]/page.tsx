import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditClassForm from './edit-form';
import { DeleteClassButton } from './delete-button';
import { SyncMeetLinkButton } from './sync-meet-link-button';
import { formatSubject, formatSchedule } from '@/lib/constants';

interface EnrollmentWithStudent {
  id: string;
  status: string;
  created_at: string;
  students: {
    id: string;
    grade_level: number | null;
    users: { full_name: string };
  };
}

interface WaitlistEntry {
  id: string;
  status: string;
  created_at: string;
  notified_at: string | null;
  students: {
    id: string;
    users: { full_name: string };
  };
}

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('*')
    .eq('id', id)
    .single();

  if (!cls) notFound();

  // Fetch enrolled students (check all slot columns)
  const { data: enrollments } = await adminClient
    .from('enrollments')
    .select(
      'id, status, created_at, students(id, grade_level, users!students_user_id_fkey(full_name))'
    )
    .or(`slot_1_class_id.eq.${id},slot_2_class_id.eq.${id},slot_3_class_id.eq.${id},class_id.eq.${id}`)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: true });

  const roster = (enrollments || []) as unknown as EnrollmentWithStudent[];

  // Fetch waitlist
  const { data: waitlistData } = await adminClient
    .from('waitlist')
    .select(
      'id, status, created_at, notified_at, students(id, users!students_user_id_fkey(full_name))'
    )
    .eq('class_id', id)
    .in('status', ['waiting', 'notified'])
    .order('created_at', { ascending: true });

  const waitlist = (waitlistData || []) as unknown as WaitlistEntry[];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Class Details</h1>
          <p className="text-slate-500">{cls.name || 'Unnamed Class'}</p>
        </div>
        <Link
          href="/admin/classes"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 transition-colors"
        >
          Back to Classes
        </Link>
      </div>

      {/* Class info summary */}
      <div className="border border-slate-200 rounded-xl p-4 mb-6 bg-slate-50">
        <p className="font-semibold text-lg">{cls.name || 'Unnamed Class'}</p>
        <p className="text-sm text-slate-600">
          {cls.subject ? formatSubject(cls.subject) : 'Subject-agnostic'}{cls.level && cls.level !== 'all_levels' ? ` — ${cls.level}` : ''} — {(cls.group_size_type as string).replace('_', ' ')} group
        </p>
        <p className="text-sm text-slate-600">
          {formatSchedule(cls)}
        </p>
        <p className="text-sm text-slate-500">
          Enrolled: {roster.length} / {cls.capacity}
          {roster.length >= (cls.capacity as number) && (
            <span className="text-error ml-2 font-medium">FULL</span>
          )}
        </p>
        {cls.class_start_date && (
          <p className="text-sm text-slate-500">
            {cls.class_start_date} — {cls.class_end_date}
          </p>
        )}
        {cls.google_meet_link && (
          <p className="text-sm text-slate-500">
            Meet: <a href={cls.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{cls.google_meet_link}</a>
          </p>
        )}
        {!cls.google_meet_link && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <p className="text-sm text-amber-600">
                No Google Meet link — students won&apos;t see a Join button
              </p>
              {cls.google_calendar_event_id && (
                <SyncMeetLinkButton classId={cls.id} />
              )}
            </div>
            <p className="text-xs text-slate-500">
              {cls.google_calendar_event_id
                ? 'Click "Sync from Calendar" or paste a link in the edit form below.'
                : 'Paste a Google Meet link in the edit form below.'}
            </p>
          </div>
        )}
        {(cls.enrollment_window_start || cls.enrollment_window_end) && (
          <p className="text-sm text-slate-500">
            Enrollment window: {cls.enrollment_window_start || '(none)'} — {cls.enrollment_window_end || '(none)'}
          </p>
        )}
      </div>

      {/* Enrolled students roster */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-navy-900 mb-3">
          Enrolled Students ({roster.length})
        </h2>
        {roster.length === 0 ? (
          <p className="text-slate-500 text-sm">No students enrolled yet.</p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[450px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Grade</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roster.map((e, i) => {
                  const student = e.students;
                  const userObj = student?.users as unknown as
                    | { full_name: string }
                    | { full_name: string }[];
                  const name = Array.isArray(userObj)
                    ? userObj[0]?.full_name
                    : userObj?.full_name;
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">
                        {name || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        {student?.grade_level || 'N/A'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            e.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waitlist */}
      {waitlist.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-navy-900 mb-3">
            Waitlist ({waitlist.length})
          </h2>
          <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {waitlist.map((w, i) => {
                  const student = w.students;
                  const userObj = student?.users as unknown as
                    | { full_name: string }
                    | { full_name: string }[];
                  const name = Array.isArray(userObj)
                    ? userObj[0]?.full_name
                    : userObj?.full_name;
                  return (
                    <tr key={w.id}>
                      <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">
                        {name || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            w.status === 'notified'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit form */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold text-navy-900 mb-4">Edit Class</h2>
        <EditClassForm cls={cls} />
      </div>

      {/* Delete */}
      <div className="border-t pt-6 mt-6">
        <DeleteClassButton classId={id} />
      </div>
    </div>
  );
}
