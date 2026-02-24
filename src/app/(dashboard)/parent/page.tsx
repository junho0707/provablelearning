import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCreditBalance, type CreditBalances } from '@/lib/credits/get-balance';
import { createAdminClient } from '@/lib/supabase/admin';
import { RemoveChildButton } from './remove-child-button';
import { MarkReadButton } from '../_components/mark-read-button';
import { CancelMakeupButton } from '../_components/cancel-makeup-button';

interface StudentCard {
  id: string;
  user_id: string | null;
  grade_level: number | null;
  active_status: string;
  full_name: string;
  email: string | null;
  enrollments: Record<string, unknown>[];
  waitlist: Record<string, unknown>[];
  makeupWaitlist: Record<string, unknown>[];
  cancellations: Record<string, unknown>[];
  creditBalances: CreditBalances;
  perfByCourse: Record<string, { totalSessions: number; attended: number; hwDone: number }>;
}

export default async function ParentDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Fetch office hours + notifications in parallel
  const [{ data: officeHours }, { data: notifications }] = await Promise.all([
    supabase.from('office_hours').select('*').eq('active', true),
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const allNotifs = notifications || [];
  const unreadNotifs = allNotifs.filter((n) => !n.read);

  // Fetch students (email/full_name columns may not exist if migration 00046 not applied)
  let students: Record<string, unknown>[] | null = null;
  {
    const { data, error } = await adminClient
      .from('students')
      .select('id, user_id, grade_level, active_status, email, full_name')
      .eq('parent_id', user.id);
    if (error?.message?.includes('column') && error?.message?.includes('does not exist')) {
      // Fallback: migration 00046 not applied
      const { data: fallbackData } = await adminClient
        .from('students')
        .select('id, user_id, grade_level, active_status')
        .eq('parent_id', user.id);
      students = fallbackData;
    } else {
      students = data;
    }
  }

  // Get full_name from users table (primary source; students.full_name is fallback)
  const allStudentUserIds = (students || [])
    .filter((s: Record<string, unknown>) => s.user_id)
    .map((s: Record<string, unknown>) => s.user_id as string);
  let userNameMap: Record<string, string> = {};
  if (allStudentUserIds.length > 0) {
    const { data: userRows } = await adminClient
      .from('users')
      .select('id, full_name')
      .in('id', allStudentUserIds);
    if (userRows) {
      for (const u of userRows) {
        if (u.full_name) userNameMap[u.id] = u.full_name;
      }
    }
  }

  const studentCards: StudentCard[] = await Promise.all(
    (students || []).map(async (s: Record<string, unknown>) => {
      const studentId = s.id as string;
      const userId = s.user_id as string | null;
      // Name: prefer users.full_name, then students.full_name fallback (may not exist)
      const fullName = (userId ? userNameMap[userId] : null)
        || (s.full_name as string)
        || 'Unknown';

      // Pending students (no user_id) have no enrollments yet
      if (!userId) {
        return {
          id: studentId,
          user_id: null,
          grade_level: s.grade_level as number | null,
          active_status: s.active_status as string,
          full_name: fullName,
          email: s.email as string | null,
          enrollments: [],
          waitlist: [],
          makeupWaitlist: [],
          cancellations: [],
          creditBalances: {} as CreditBalances,
          perfByCourse: {},
        };
      }

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('*, classes(group_size_type, meeting_day, meeting_time), courses(name, subject, start_date, end_date)')
        .eq('student_id', studentId)
        .in('status', ['active', 'completed']);

      const creditBalances = await getCreditBalance(adminClient, studentId);

      const { data: waitlistEntries } = await adminClient
        .from('waitlist')
        .select('id, status, created_at, class_id, classes(meeting_day, meeting_time, courses(name))')
        .eq('student_id', studentId)
        .in('status', ['waiting', 'notified'])
        .order('created_at', { ascending: true });

      const { data: makeupWaitlistEntries } = await adminClient
        .from('makeup_waitlist')
        .select('id, status, session_date, session_number, host_class_id, classes!makeup_waitlist_host_class_id_fkey(meeting_day, meeting_time)')
        .eq('student_id', studentId)
        .eq('status', 'waiting')
        .order('created_at', { ascending: true });

      const { data: perfLogs } = await supabase
        .from('performance_logs')
        .select('course_id, attendance, homework_completed')
        .eq('student_id', studentId);

      // Fetch cancellations (simple query — no nested joins that can silently fail)
      const { data: cancellationsRaw } = await adminClient
        .from('session_cancellations')
        .select('id, session_number, session_date, status, group_size_type, reason, rescheduled_to, course_id, class_id, enrollment_id')
        .eq('student_id', studentId)
        .order('session_date', { ascending: false })
        .limit(20);

      // Fetch enrollment statuses to filter out dropped/canceled
      const cancellationEnrollmentIds = [...new Set((cancellationsRaw || []).map((c) => c.enrollment_id as string))];
      let enrollmentStatusMap: Record<string, string> = {};
      if (cancellationEnrollmentIds.length > 0) {
        const { data: enrRows } = await adminClient
          .from('enrollments')
          .select('id, status')
          .in('id', cancellationEnrollmentIds);
        for (const row of enrRows || []) {
          enrollmentStatusMap[row.id] = row.status;
        }
      }

      // Fetch makeup bookings for these cancellations
      const cancellationIds = (cancellationsRaw || []).map((c) => c.id as string);
      let makeupMap: Record<string, Record<string, unknown>> = {};
      if (cancellationIds.length > 0) {
        const { data: makeups } = await adminClient
          .from('makeup_bookings')
          .select('id, cancellation_id, session_date, status, host_class_id, makeup_session_id')
          .in('cancellation_id', cancellationIds);
        for (const m of makeups || []) {
          if (m.status === 'booked' || m.status === 'attended') {
            makeupMap[m.cancellation_id as string] = m;
          }
        }
      }

      // Fetch class info for makeup host classes + cancellation original classes
      const allClassIds = [
        ...(cancellationsRaw || []).map((c) => c.class_id as string),
        ...Object.values(makeupMap).map((m) => m.host_class_id as string),
      ].filter(Boolean);
      let classInfoMap: Record<string, { meeting_day: string; meeting_time: string }> = {};
      if (allClassIds.length > 0) {
        const { data: classRows } = await adminClient
          .from('classes')
          .select('id, meeting_day, meeting_time')
          .in('id', [...new Set(allClassIds)]);
        for (const row of classRows || []) {
          classInfoMap[row.id] = { meeting_day: row.meeting_day, meeting_time: row.meeting_time };
        }
      }

      // Fetch makeup session info for dedicated makeup bookings
      const allMakeupSessionIds = Object.values(makeupMap)
        .map((m) => m.makeup_session_id as string)
        .filter(Boolean);
      let makeupSessionInfoMap: Record<string, { session_date: string; session_time: string; location: string | null }> = {};
      if (allMakeupSessionIds.length > 0) {
        const { data: msRows } = await adminClient
          .from('makeup_sessions')
          .select('id, session_date, session_time, location')
          .in('id', [...new Set(allMakeupSessionIds)]);
        for (const row of msRows || []) {
          makeupSessionInfoMap[row.id] = { session_date: row.session_date, session_time: row.session_time, location: row.location };
        }
      }

      // Filter out cancellations for dropped/canceled enrollments, and attach makeup + class info
      const cancellations = (cancellationsRaw || [])
        .filter((c) => {
          const enrStatus = enrollmentStatusMap[c.enrollment_id as string];
          return enrStatus !== 'canceled' && enrStatus !== 'dropped';
        })
        .map((c) => ({
          ...c,
          _originalClass: classInfoMap[c.class_id as string] || null,
          _makeup: makeupMap[c.id as string] || null,
          _makeupClass: makeupMap[c.id as string]
            ? classInfoMap[makeupMap[c.id as string].host_class_id as string] || null
            : null,
          _makeupSession: makeupMap[c.id as string]?.makeup_session_id
            ? makeupSessionInfoMap[makeupMap[c.id as string].makeup_session_id as string] || null
            : null,
        }));

      const perfByCourse: Record<string, { totalSessions: number; attended: number; hwDone: number }> = {};
      for (const p of perfLogs || []) {
        const cid = p.course_id as string;
        if (!perfByCourse[cid]) perfByCourse[cid] = { totalSessions: 0, attended: 0, hwDone: 0 };
        perfByCourse[cid].totalSessions++;
        if (p.attendance) perfByCourse[cid].attended++;
        if (p.homework_completed) perfByCourse[cid].hwDone++;
      }

      return {
        id: studentId,
        user_id: userId,
        grade_level: s.grade_level as number | null,
        active_status: s.active_status as string,
        full_name: fullName,
        email: s.email as string | null,
        enrollments: (enrollments || []) as Record<string, unknown>[],
        waitlist: (waitlistEntries || []) as Record<string, unknown>[],
        makeupWaitlist: (makeupWaitlistEntries || []) as Record<string, unknown>[],
        cancellations: (cancellations || []) as Record<string, unknown>[],
        creditBalances,
        perfByCourse,
      };
    })
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href="/parent/drop-class"
            className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Drop Class
          </Link>
          <Link
            href="/parent/cancel-session"
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancel Session
          </Link>
          <Link
            href="/parent/refund"
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Request Refund
          </Link>
          <Link
            href="/parent/add-child"
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Add Child
          </Link>
          <Link
            href="/enroll"
            className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
          >
            Enroll Student
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {unreadNotifs.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Notifications ({unreadNotifs.length})
          </h2>
          {unreadNotifs.map((n) => (
            <div key={n.id} className="flex items-start justify-between bg-blue-50 border border-blue-200 rounded p-3">
              <div>
                <p className="text-sm">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleDateString()}
                </p>
              </div>
              <MarkReadButton notificationId={n.id} />
            </div>
          ))}
        </div>
      )}

      {/* Office Hours */}
      {officeHours && officeHours.length > 0 && (
        <div className="mb-6 border rounded-lg p-4 bg-green-50">
          <h2 className="text-sm font-semibold mb-2">Office Hours</h2>
          {officeHours.map((oh) => (
            <div key={oh.id} className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {oh.day_of_week}s, {oh.start_time} – {oh.end_time}
              </p>
              <a
                href={oh.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded bg-green-600 px-3 py-1 text-white text-sm font-medium hover:bg-green-700"
              >
                Join
              </a>
            </div>
          ))}
        </div>
      )}

      {studentCards.length === 0 && (
        <div className="text-center py-8 border rounded-lg">
          <p className="text-gray-500 mb-4">No students linked to your account yet.</p>
          <Link
            href="/parent/add-child"
            className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
          >
            Add Your First Child
          </Link>
        </div>
      )}

      <div className="space-y-6">
        {studentCards.map((s) => (
          <div key={s.id} className="border rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">{s.full_name}</h2>
                  <RemoveChildButton
                    studentId={s.id}
                    childName={s.full_name}
                    hasActiveEnrollments={s.enrollments.some(
                      (e) => e.status === 'active' || e.status === 'pending'
                    )}
                  />
                </div>
                <p className="text-sm text-gray-500">
                  Grade {s.grade_level || 'N/A'} — {s.active_status}
                </p>
                {s.user_id ? (
                  <p className="text-xs text-gray-500 mt-1">
                    {s.email || 'Linked'}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-1">
                    Pending — waiting for first Google login
                    {s.email && <span className="text-gray-400 ml-1">({s.email})</span>}
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                <p className="text-gray-600 font-medium mb-1">Credits</p>
                {Object.entries(s.creditBalances).filter(([, v]) => v > 0).length === 0 ? (
                  <p className="text-gray-400">None</p>
                ) : (
                  Object.entries(s.creditBalances)
                    .filter(([, v]) => v > 0)
                    .map(([type, count]) => (
                      <p key={type}>
                        {count} {type.replace('_', ' ')}
                      </p>
                    ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              {s.enrollments.map((e) => {
                const course = e.courses as Record<string, string>;
                const cls = e.classes as Record<string, string>;
                const courseId = (e as Record<string, unknown>).course_id as string;
                const enrollmentId = e.id as string;
                const classId = (e as Record<string, unknown>).class_id as string;
                const perf = s.perfByCourse[courseId];
                // Cancellations for this enrollment (match by enrollment_id or class_id)
                const enrollCancellations = s.cancellations.filter(
                  (c) => (c.enrollment_id as string) === enrollmentId || (c.class_id as string) === classId
                );

                return (
                  <div key={enrollmentId} className="bg-gray-50 rounded px-4 py-3 text-sm">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{course?.name}</span>
                        <span className="text-gray-500 ml-2">
                          {cls?.meeting_day} {cls?.meeting_time}
                        </span>
                      </div>
                      <span className="capitalize text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                        {e.status as string}
                      </span>
                    </div>
                    {perf && perf.totalSessions > 0 && (
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        <span>Attendance: <span className="font-medium text-gray-700">{perf.attended}/{perf.totalSessions}</span></span>
                        <span>Homework: <span className="font-medium text-gray-700">{perf.hwDone}/{perf.totalSessions}</span></span>
                      </div>
                    )}
                    {enrollCancellations.length > 0 && (
                      <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
                        {enrollCancellations.map((c) => {
                          const origClass = (c as Record<string, unknown>)._originalClass as { meeting_day: string; meeting_time: string } | null;
                          const makeup = (c as Record<string, unknown>)._makeup as Record<string, unknown> | null;
                          const makeupClass = (c as Record<string, unknown>)._makeupClass as { meeting_day: string; meeting_time: string } | null;
                          const makeupSession = (c as Record<string, unknown>)._makeupSession as { session_date: string; session_time: string; location: string | null } | null;

                          return (
                            <div key={c.id as string} className="text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-red-500">&#10005;</span>
                                <span className="text-gray-600">
                                  Session {c.session_number as number} — {c.session_date as string}
                                  {origClass ? ` (${origClass.meeting_day} ${origClass.meeting_time})` : ''}
                                </span>
                                {makeup ? (
                                  <>
                                    <span className="text-gray-400">→</span>
                                    {makeupSession ? (
                                      <span className="text-blue-600">
                                        Makeup: {makeupSession.session_date} at {makeupSession.session_time}
                                        {makeupSession.location ? ` (${makeupSession.location})` : ''}
                                      </span>
                                    ) : (
                                      <span className="text-blue-600">
                                        Makeup: {makeupClass?.meeting_day || ''} at {makeupClass?.meeting_time || ''} ({makeup.session_date as string})
                                      </span>
                                    )}
                                    {makeup.status === 'booked' && (
                                      <CancelMakeupButton bookingId={makeup.id as string} />
                                    )}
                                  </>
                                ) : c.status === 'credit_issued' ? (
                                  <span className="text-green-600 ml-1">— credit issued</span>
                                ) : c.status === 'cancelled' && ['small', 'medium', 'large'].includes(c.group_size_type as string) ? (
                                  <>
                                    <span className="text-gray-400">—</span>
                                    <Link
                                      href={`/parent/cancel-session/alternate?cancellation_id=${c.id}`}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {['small', 'medium'].includes(c.group_size_type as string) ? 'Find Makeup' : 'Find Alternate'}
                                    </Link>
                                  </>
                                ) : c.status === 'cancelled' ? (
                                  <span className="text-amber-600 ml-1">— awaiting reschedule</span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {s.waitlist.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">Enrollment Waitlist</h3>
                <div className="space-y-2">
                  {s.waitlist.map((w) => {
                    const wCls = w.classes as Record<string, unknown>;
                    const wCourse = wCls?.courses as Record<string, string> | Record<string, string>[];
                    const courseObj = Array.isArray(wCourse) ? wCourse[0] : wCourse;
                    return (
                      <div key={w.id as string} className="flex justify-between items-center bg-amber-50 rounded px-4 py-2 text-sm">
                        <div>
                          <span className="font-medium">{courseObj?.name || 'Course'}</span>
                          <span className="text-gray-500 ml-2">
                            {(wCls?.meeting_day as string) || ''} {(wCls?.meeting_time as string) || ''}
                          </span>
                          <span className="text-gray-400 ml-2 text-xs">{new Date(w.created_at as string).toLocaleDateString()}</span>
                        </div>
                        <span className={`capitalize text-xs px-2 py-0.5 rounded ${
                          w.status === 'notified'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {(w.status as string) === 'notified' ? 'notified' : 'waiting'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {s.makeupWaitlist.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">Makeup Waitlist</h3>
                <div className="space-y-2">
                  {s.makeupWaitlist.map((mw) => {
                    const mwCls = mw.classes as Record<string, unknown> | Record<string, unknown>[];
                    const classInfo = Array.isArray(mwCls) ? mwCls[0] : mwCls;
                    return (
                      <div key={mw.id as string} className="flex justify-between items-center bg-amber-50 rounded px-4 py-2 text-sm">
                        <div>
                          <span className="font-medium">
                            Session {mw.session_number as number}
                          </span>
                          <span className="text-gray-500 ml-2">
                            {(classInfo?.meeting_day as string) || ''} {(classInfo?.meeting_time as string) || ''}
                          </span>
                          <span className="text-gray-400 ml-2 text-xs">
                            {mw.session_date as string}
                          </span>
                        </div>
                        <span className="capitalize text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          waiting
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
