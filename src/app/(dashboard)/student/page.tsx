import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCreditBalance } from '@/lib/credits/get-balance';
import { MessageForm } from './message-form';
import { MarkReadButton } from '../_components/mark-read-button';
import { CancelMakeupButton } from '../_components/cancel-makeup-button';

export default async function StudentDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get student record
  const { data: student } = await supabase
    .from('students')
    .select('id, parent_id')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Student Dashboard</h1>
        <p className="text-gray-500">Student profile not found. Contact admin.</p>
      </div>
    );
  }

  const isIndependent = !student.parent_id;

  // Parallel fetches
  const [
    { data: enrollments },
    { data: perfLogs },
    { data: notifications },
    { data: officeHours },
    { data: recentMessages },
    { data: waitlistEntries },
    { data: makeupWaitlistEntries },
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('*, classes(group_size_type, meeting_day, meeting_time, google_meet_link, google_classroom_id), courses(name, subject, level, start_date, end_date)')
      .eq('student_id', student.id)
      .in('status', ['active', 'pending']),
    supabase
      .from('performance_logs')
      .select('*')
      .eq('student_id', student.id)
      .order('session_number', { ascending: true }),
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('office_hours')
      .select('*')
      .eq('active', true),
    supabase
      .from('messages')
      .select('*')
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(20),
    adminClient
      .from('waitlist')
      .select('id, status, created_at, class_id, classes(meeting_day, meeting_time, courses(name))')
      .eq('student_id', student.id)
      .in('status', ['waiting', 'notified'])
      .order('created_at', { ascending: true }),
    adminClient
      .from('makeup_waitlist')
      .select('id, status, session_date, session_number, host_class_id, classes!makeup_waitlist_host_class_id_fkey(meeting_day, meeting_time)')
      .eq('student_id', student.id)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true }),
  ]);

  // Credit balances
  const creditBalances = await getCreditBalance(adminClient, student.id);

  // Cancellations (separate batch queries — no nested joins that silently fail)
  const { data: cancellationsRaw } = await adminClient
    .from('session_cancellations')
    .select('id, session_number, session_date, status, group_size_type, reason, rescheduled_to, course_id, class_id, enrollment_id')
    .eq('student_id', student.id)
    .order('session_date', { ascending: false })
    .limit(20);

  // Filter out cancellations for dropped/canceled enrollments
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

  // Makeup bookings for cancellations
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

  // Class info for makeup host classes + cancellation original classes
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

  // Dedicated makeup session info
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

  // Filter and enrich cancellations
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

  // Performance stats per course
  const perfByCourse: Record<string, { totalSessions: number; attended: number; hwDone: number }> = {};
  for (const p of perfLogs || []) {
    const cid = p.course_id as string;
    if (!perfByCourse[cid]) perfByCourse[cid] = { totalSessions: 0, attended: 0, hwDone: 0 };
    perfByCourse[cid].totalSessions++;
    if (p.attendance) perfByCourse[cid].attended++;
    if (p.homework_completed) perfByCourse[cid].hwDone++;
  }

  const allNotifs = notifications || [];
  const makeupNotifs = allNotifs.filter((n) => n.type === 'makeup');
  const unreadNotifs = allNotifs.filter((n) => !n.read && n.type !== 'makeup');

  // Find admin/tutor user for messaging
  const { data: adminUsers } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('role', 'admin')
    .limit(1);

  const tutorId = adminUsers?.[0]?.id || null;
  const tutorName = adminUsers?.[0]?.full_name || 'Tutor';

  // Route prefix for links (independent students use /student, parent-managed use no action links)
  const actionPrefix = isIndependent ? '/student' : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Student Dashboard</h1>
        {isIndependent && (
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/student/drop-class"
              className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Drop Class
            </Link>
            <Link
              href="/student/cancel-session"
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel Session
            </Link>
            <Link
              href="/student/refund"
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Refunds
            </Link>
            <Link
              href="/enroll"
              className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
            >
              Browse Courses
            </Link>
          </div>
        )}
      </div>

      {/* Credit Balances */}
      {Object.entries(creditBalances).filter(([, v]) => v > 0).length > 0 && (
        <div className="mb-6 border rounded-lg p-4 bg-purple-50">
          <h2 className="text-sm font-semibold mb-2">Credits</h2>
          <div className="flex gap-4">
            {Object.entries(creditBalances)
              .filter(([, v]) => v > 0)
              .map(([type, count]) => (
                <span key={type} className="text-sm">
                  <span className="font-medium">{count}</span> {type.replace('_', ' ')}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Makeup Notifications */}
      {makeupNotifs.length > 0 && (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Upcoming Makeups
          </h2>
          {makeupNotifs.map((n) => (
            <div key={n.id} className="bg-amber-50 border border-amber-200 rounded p-3">
              <p className="text-sm">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(n.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Other Notifications */}
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

      {/* Enrollments */}
      {(!enrollments || enrollments.length === 0) && (
        <p className="text-gray-500 mb-6">
          No active enrollments.{' '}
          {isIndependent ? (
            <Link href="/enroll" className="underline">Browse available courses</Link>
          ) : (
            'Ask your parent to enroll you in a course.'
          )}
        </p>
      )}

      <div className="space-y-6">
        {enrollments?.map((e: Record<string, unknown>) => {
          const course = e.courses as Record<string, string>;
          const cls = e.classes as Record<string, unknown>;
          const courseId = e.course_id as string;
          const enrollmentId = e.id as string;
          const classId = e.class_id as string;
          const perf = perfByCourse[courseId];
          const coursePerfLogs = (perfLogs || []).filter(
            (p) => p.course_id === courseId
          );

          // Cancellations for this enrollment
          const enrollCancellations = cancellations.filter(
            (c) => (c.enrollment_id as string) === enrollmentId || (c.class_id as string) === classId
          );

          return (
            <div key={enrollmentId} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{course?.name}</h2>
                  <p className="text-sm text-gray-600">
                    {course?.subject?.replace('_', ' ')} — {course?.level}
                  </p>
                  <p className="text-sm text-gray-500">
                    {course?.start_date} to {course?.end_date}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p>{cls?.meeting_day as string} at {cls?.meeting_time as string}</p>
                  <p className="text-gray-500">{(cls?.group_size_type as string)?.replace('_', ' ')} group</p>
                  {perf && perf.totalSessions > 0 && (
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                      <span>Attendance: <span className="font-medium text-gray-700">{perf.attended}/{perf.totalSessions}</span></span>
                      <span>HW: <span className="font-medium text-gray-700">{perf.hwDone}/{perf.totalSessions}</span></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Links */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {(cls?.google_meet_link as string) && (
                  <a
                    href={cls.google_meet_link as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded bg-blue-600 px-3 py-1.5 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Join Class
                  </a>
                )}
                {(cls?.google_classroom_id as string) && (
                  <a
                    href={`https://classroom.google.com/c/${cls.google_classroom_id as string}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                  >
                    Google Classroom
                  </a>
                )}
              </div>

              {/* Cancellations inline */}
              {enrollCancellations.length > 0 && (
                <div className="mb-4 border-t border-gray-200 pt-3 space-y-1.5">
                  {enrollCancellations.map((c) => {
                    const origClass = c._originalClass as { meeting_day: string; meeting_time: string } | null;
                    const makeup = c._makeup as Record<string, unknown> | null;
                    const makeupClass = c._makeupClass as { meeting_day: string; meeting_time: string } | null;
                    const makeupSession = c._makeupSession as { session_date: string; session_time: string; location: string | null } | null;

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
                              <span className="text-gray-400">&rarr;</span>
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
                          ) : c.status === 'cancelled' && ['small', 'medium', 'large'].includes(c.group_size_type as string) && actionPrefix ? (
                            <>
                              <span className="text-gray-400">—</span>
                              <Link
                                href={`${actionPrefix}/cancel-session/alternate?cancellation_id=${c.id}`}
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

              {/* Session Log */}
              {coursePerfLogs.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2">Session Log</h3>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {Array.from({ length: 8 }, (_, i) => {
                      const log = coursePerfLogs.find((p) => p.session_number === i + 1);
                      return (
                        <div
                          key={i}
                          className={`rounded p-2 text-center text-xs ${
                            log?.attendance
                              ? 'bg-green-100 text-green-800'
                              : log
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          <p className="font-medium">S{i + 1}</p>
                          {log && (
                            <>
                              <p>{log.attendance ? 'Present' : 'Absent'}</p>
                              <p>{log.homework_completed ? 'HW Done' : 'HW Due'}</p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Enrollment Waitlist */}
      {waitlistEntries && waitlistEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Enrollment Waitlist</h2>
          <div className="space-y-2">
            {waitlistEntries.map((w: Record<string, unknown>) => {
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

      {/* Makeup Waitlist */}
      {makeupWaitlistEntries && makeupWaitlistEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Makeup Waitlist</h2>
          <div className="space-y-2">
            {makeupWaitlistEntries.map((mw: Record<string, unknown>) => {
              const mwCls = mw.classes as Record<string, unknown> | Record<string, unknown>[];
              const classInfo = Array.isArray(mwCls) ? mwCls[0] : mwCls;
              return (
                <div key={mw.id as string} className="flex justify-between items-center bg-amber-50 rounded px-4 py-2 text-sm">
                  <div>
                    <span className="font-medium">Session {mw.session_number as number}</span>
                    <span className="text-gray-500 ml-2">
                      {(classInfo?.meeting_day as string) || ''} {(classInfo?.meeting_time as string) || ''}
                    </span>
                    <span className="text-gray-400 ml-2 text-xs">{mw.session_date as string}</span>
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

      {/* Messages */}
      <div className="mt-8 border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Message Your Tutor</h2>
        {tutorId ? (
          <>
            <MessageForm tutorId={tutorId} />
            {recentMessages && recentMessages.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-medium text-gray-500">Recent Messages</h3>
                {recentMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded p-3 text-sm ${
                      msg.from_user_id === user.id
                        ? 'bg-blue-50 ml-8'
                        : 'bg-gray-50 mr-8'
                    }`}
                  >
                    <p className="text-xs text-gray-400 mb-1">
                      {msg.from_user_id === user.id ? 'You' : tutorName} &middot;{' '}
                      {new Date(msg.created_at).toLocaleString()}
                    </p>
                    <p>{msg.body}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">No tutor available for messaging.</p>
        )}
      </div>
    </div>
  );
}
