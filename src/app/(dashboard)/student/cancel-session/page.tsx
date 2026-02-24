import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSessionDates } from '@/lib/scheduling/session-dates';
import {
  CancelSessionForm,
  type CancellableSession,
} from '../../_components/cancel-session-form';

export default async function StudentCancelSessionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get own student record (independent student)
  const { data: student } = await adminClient
    .from('students')
    .select('id, users!students_user_id_fkey(full_name)')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Cancel a Session</h1>
        <p className="text-gray-500">Student profile not found.</p>
      </div>
    );
  }

  const studentId = student.id as string;
  const userObj = (student as Record<string, unknown>).users as unknown as
    | Record<string, string>
    | Record<string, string>[];
  const studentName =
    (Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name) ||
    'Student';

  // Get active enrollments with class + course
  const { data: enrollmentData } = await supabase
    .from('enrollments')
    .select(
      'id, student_id, course_id, class_id, status, classes(group_size_type, meeting_day, meeting_time), courses(name, start_date)'
    )
    .eq('student_id', studentId)
    .eq('status', 'active');
  const enrollments = (enrollmentData || []) as Record<string, unknown>[];

  // Get existing cancellations and makeup bookings
  const [{ data: cancelData }, { data: makeupData }] = await Promise.all([
    supabase
      .from('session_cancellations')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false }),
    adminClient
      .from('makeup_bookings')
      .select('cancellation_id, session_date, status, host_class_id, classes(meeting_day, meeting_time)')
      .eq('student_id', studentId)
      .in('status', ['booked', 'attended']),
  ]);
  const existingCancellations = (cancelData || []) as Record<string, unknown>[];
  const makeupBookings: Record<string, Record<string, unknown>> = {};
  for (const m of (makeupData || []) as Record<string, unknown>[]) {
    makeupBookings[m.cancellation_id as string] = m;
  }

  // Build set of already-cancelled session keys
  const cancelledKeys = new Set(
    existingCancellations.map(
      (c) => `${c.student_id}:${c.course_id}:${c.session_number}`
    )
  );

  // Build cancellable sessions list
  const cancellableSessions: CancellableSession[] = [];

  for (const e of enrollments) {
    const cls = e.classes as Record<string, string>;
    const course = e.courses as Record<string, string>;

    const sessions = computeSessionDates(course?.start_date, cls?.meeting_day);

    for (const session of sessions) {
      if (session.isPast) continue;
      const key = `${studentId}:${e.course_id}:${session.sessionNumber}`;
      if (cancelledKeys.has(key)) continue;

      cancellableSessions.push({
        enrollmentId: e.id as string,
        studentName,
        courseName: course?.name || 'Course',
        sessionNumber: session.sessionNumber,
        sessionDate: session.dateStr,
        groupSizeType: cls?.group_size_type || '',
        meetingTime: cls?.meeting_time || '',
      });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cancel a Session</h1>
        <Link
          href="/student"
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Dashboard
        </Link>
      </div>

      {cancellableSessions.length > 0 ? (
        <CancelSessionForm
          sessions={cancellableSessions}
          rescheduleBasePath="/student/cancel-session"
        />
      ) : (
        <p className="text-gray-500 mb-6">
          {enrollments.length === 0
            ? 'No active enrollments.'
            : 'No upcoming sessions available to cancel.'}
        </p>
      )}

      {/* Cancellation History */}
      {existingCancellations.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Cancellation History</h2>
          <div className="space-y-3">
            {existingCancellations.map((c) => (
              <div key={c.id as string} className="border rounded p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">
                      Session {c.session_number as number} — {c.session_date as string}
                    </p>
                    {c.reason ? (
                      <p className="text-sm text-gray-500 mt-1">{String(c.reason)}</p>
                    ) : null}
                    <p className="text-xs text-gray-400 mt-1">
                      Cancelled{' '}
                      {new Date(c.created_at as string).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded capitalize ${
                      c.status === 'cancelled'
                        ? 'bg-yellow-100 text-yellow-800'
                        : c.status === 'rescheduled'
                        ? 'bg-blue-100 text-blue-800'
                        : c.status === 'credit_issued'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
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
                  const mCls = m.classes as Record<string, string> | Record<string, string>[];
                  const classInfo = Array.isArray(mCls) ? mCls[0] : mCls;
                  return (
                    <p className="text-sm text-blue-600 mt-2">
                      Makeup: {classInfo?.meeting_day} at {classInfo?.meeting_time} ({m.session_date as string})
                    </p>
                  );
                })()}
                {c.status === 'cancelled' && !makeupBookings[c.id as string] && (
                  <Link
                    href={`/student/cancel-session/alternate?cancellation_id=${c.id as string}`}
                    className="inline-block mt-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
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
