import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeEnrollmentSessions } from '@/lib/scheduling/session-dates';
import { formatTime } from '@/lib/constants';
import {
  CancelSessionForm,
  type CancellableSession,
} from '../../_components/cancel-session-form';

export default async function ParentCancelSessionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get students
  const { data: students } = await adminClient
    .from('students')
    .select('id, users!students_user_id_fkey(full_name)')
    .eq('parent_id', user.id);

  const studentIds = (students || []).map(
    (s: Record<string, unknown>) => s.id as string
  );

  // Get active enrollments with class info
  let enrollments: Record<string, unknown>[] = [];
  if (studentIds.length > 0) {
    const { data } = await supabase
      .from('enrollments')
      .select(
        'id, student_id, class_id, status, slot_1_class_id, slot_2_class_id, slot_3_class_id, student_start_date, student_end_date, classes!class_id(name, subject, level, group_size_type, meeting_day, meeting_time, class_start_date, class_end_date)'
      )
      .in('student_id', studentIds)
      .eq('status', 'active');
    enrollments = (data || []) as Record<string, unknown>[];
  }

  // Fetch all classes referenced by slot columns (for meeting_day lookup)
  const slotClassIds = new Set<string>();
  for (const e of enrollments) {
    if (e.slot_1_class_id) slotClassIds.add(e.slot_1_class_id as string);
    if (e.slot_2_class_id) slotClassIds.add(e.slot_2_class_id as string);
    if (e.slot_3_class_id) slotClassIds.add(e.slot_3_class_id as string);
  }
  const slotClassMap: Record<string, { meeting_day: string }> = {};
  if (slotClassIds.size > 0) {
    const { data: slotClasses } = await adminClient
      .from('classes')
      .select('id, meeting_day')
      .in('id', Array.from(slotClassIds));
    for (const c of (slotClasses || []) as Record<string, string>[]) {
      slotClassMap[c.id] = { meeting_day: c.meeting_day };
    }
  }

  // Get existing cancellations for these students
  let existingCancellations: Record<string, unknown>[] = [];
  let makeupBookings: Record<string, Record<string, unknown>> = {};
  if (studentIds.length > 0) {
    const [{ data: cancelData }, { data: makeupData }] = await Promise.all([
      supabase
        .from('session_cancellations')
        .select('*')
        .in('student_id', studentIds)
        .order('created_at', { ascending: false }),
      adminClient
        .from('makeup_bookings')
        .select('cancellation_id, session_date, status, host_class_id, classes(meeting_day, meeting_time)')
        .in('student_id', studentIds)
        .in('status', ['booked', 'attended']),
    ]);
    existingCancellations = (cancelData || []) as Record<string, unknown>[];
    for (const m of (makeupData || []) as Record<string, unknown>[]) {
      makeupBookings[m.cancellation_id as string] = m;
    }
  }

  // Build set of already-cancelled session keys
  const cancelledKeys = new Set(
    existingCancellations.map(
      (c) => `${c.student_id}:${c.enrollment_id}:${c.session_number}`
    )
  );

  // Build cancellable sessions list
  const cancellableSessions: CancellableSession[] = [];

  for (const e of enrollments) {
    const cls = e.classes as Record<string, string>;
    const studentId = e.student_id as string;

    if (cls?.group_size_type === 'large') continue; // LG: no cancellation

    const studentRecord = (students || []).find(
      (s: Record<string, unknown>) => s.id === studentId
    );
    const userObj = (studentRecord as Record<string, unknown>)?.users as unknown as
      | Record<string, string>
      | Record<string, string>[];
    const studentName = Array.isArray(userObj)
      ? userObj[0]?.full_name
      : userObj?.full_name;

    const startDate = (e.student_start_date as string) || (cls?.class_start_date as string);
    const slot1Id = (e.slot_1_class_id || e.class_id) as string;
    const slot2Id = e.slot_2_class_id as string | null;
    const slot3Id = e.slot_3_class_id as string | null;
    const sessions = computeEnrollmentSessions(
      startDate,
      { classId: slot1Id, meetingDay: slotClassMap[slot1Id]?.meeting_day || cls?.meeting_day as string },
      slot2Id ? { classId: slot2Id, meetingDay: slotClassMap[slot2Id]?.meeting_day || '' } : null,
      slot3Id ? { classId: slot3Id, meetingDay: slotClassMap[slot3Id]?.meeting_day || '' } : null
    );

    for (const session of sessions) {
      if (session.isPast) continue;
      const key = `${studentId}:${e.id}:${session.sessionNumber}`;
      if (cancelledKeys.has(key)) continue;

      cancellableSessions.push({
        enrollmentId: e.id as string,
        studentName: studentName || 'Student',
        courseName: cls?.name || 'Class',
        sessionNumber: session.sessionNumber,
        sessionDate: session.dateStr,
        groupSizeType: cls?.group_size_type || '',
        meetingTime: cls?.meeting_time || '',
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Cancel a Session</h1>
        <p className="text-slate-500">Cancel an upcoming session and find a makeup slot.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {cancellableSessions.length > 0 ? (
          <CancelSessionForm
            sessions={cancellableSessions}
            rescheduleBasePath="/parent/cancel-session"
          />
        ) : (
          <p className="text-slate-500">
            {enrollments.length === 0
              ? 'No active enrollments.'
              : 'No upcoming sessions available to cancel.'}
          </p>
        )}
      </div>

      {/* Cancellation History */}
      {existingCancellations.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-100 sm:px-6">
            <h2 className="text-lg font-semibold text-navy-900">Cancellation History</h2>
          </div>
          <div className="p-4 space-y-3 sm:p-6">
            {existingCancellations.map((c) => (
              <div key={c.id as string} className="border border-slate-200 rounded-lg p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                  <div>
                    <p className="text-sm font-medium text-navy-900">
                      Session {c.session_number as number} — {c.session_date as string}
                    </p>
                    {c.reason ? (
                      <p className="text-sm text-slate-500 mt-1">{String(c.reason)}</p>
                    ) : null}
                    <p className="text-xs text-slate-400 mt-1">
                      Cancelled{' '}
                      {new Date(c.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${
                      c.status === 'cancelled'
                        ? 'bg-amber-50 text-amber-700'
                        : c.status === 'rescheduled'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {(c.status as string).replace('_', ' ')}
                  </span>
                </div>
                {c.rescheduled_to ? (
                  <p className="text-sm text-blue-600 mt-2">
                    Rescheduled to{' '}
                    {new Date(String(c.rescheduled_to)).toLocaleString()}
                  </p>
                ) : null}
                {makeupBookings[c.id as string] && (() => {
                  const m = makeupBookings[c.id as string];
                  const cls = m.classes as Record<string, string> | Record<string, string>[];
                  const classInfo = Array.isArray(cls) ? cls[0] : cls;
                  return (
                    <p className="text-sm text-blue-600 mt-2">
                      Makeup: {classInfo?.meeting_day} at {formatTime(classInfo?.meeting_time || '')} ({m.session_date as string})
                    </p>
                  );
                })()}
                {c.status === 'cancelled' && !makeupBookings[c.id as string] && (
                  <Link
                    href={`/parent/cancel-session/alternate?cancellation_id=${c.id as string}`}
                    className="inline-block mt-3 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
                  >
                    Find Alternate Session
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
