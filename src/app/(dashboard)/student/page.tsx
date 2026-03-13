import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCreditBalance } from '@/lib/credits/get-balance';
import { formatSubjectCategory, formatTime, dayIndex } from '@/lib/constants';
import { isStudentInClassroom } from '@/lib/google/classroom';
import { MessageForm } from '../_components/message-form';
import { CancelMakeupButton } from '../_components/cancel-makeup-button';
import { DeleteMessageButton } from '../_components/delete-message-button';
import { ExcuseNoteForm } from '../_components/excuse-note-form';
import { PayNowButton } from '../_components/pay-now-button';
import { submitExcuseNote } from './submit-excuse-action';
import { computeEnrollmentSessions } from '@/lib/scheduling/session-dates';
import { LeaveWaitlistButton } from '../_components/leave-waitlist-button';
import { EditPreferredSlotsForm } from '../_components/edit-preferred-slots-form';
import { relativeTime, getNotifDotColor } from '../_components/notification-utils';
import { SessionPerformance, type SessionPerfCard } from '../_components/attendance-dots';
import { MarkReadButton } from '../_components/mark-read-button';
import { DashboardViewToggle } from '../_components/dashboard-view-toggle';
import { RemindersList, type ReminderItem } from '../_components/reminders-list';

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
    .select('id, parent_id, email')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Student Dashboard</h1>
          <p className="text-slate-500">View your classes, sessions, and credits.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-500">Student profile not found. Contact admin.</p>
        </div>
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
    { data: existingBookings },
  ] = await Promise.all([
    supabase
      .from('enrollments')
      .select('*, slot_1_class_id, slot_2_class_id, slot_3_class_id, student_start_date, student_end_date, classes!class_id(name, subject, level, group_size_type, meeting_day, meeting_time, google_meet_link, google_classroom_id, google_classroom_enrollment_code, google_classroom_link, class_start_date, class_end_date)')
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
      .select('id, status, created_at, class_id, preferred_class_ids, offer_expires_at, notified_at')
      .eq('student_id', student.id)
      .in('status', ['waiting', 'notified'])
      .order('created_at', { ascending: true }),
    adminClient
      .from('makeup_waitlist')
      .select('id, status, session_date, session_number, host_class_id, classes!makeup_waitlist_host_class_id_fkey(meeting_day, meeting_time)')
      .eq('student_id', student.id)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true }),
    isIndependent
      ? adminClient
          .from('bookings')
          .select('id, datetime, duration_min, status, meet_link, meeting_type, student_name, class_name, user_id, booking_type')
          .or(`user_id.eq.${user.id},parent_email.ilike.${user.email ?? ''}`)
          .eq('status', 'confirmed')
          .gte('datetime', new Date().toISOString())
          .order('datetime', { ascending: true })
      : Promise.resolve({ data: null }),
  ]);

  console.log('[student-dashboard] waitlistEntries:', JSON.stringify(waitlistEntries));

  // Fetch class info for LG waitlist entries (class_id not null)
  const wlClassIds = (waitlistEntries || [])
    .map((w: Record<string, unknown>) => w.class_id)
    .filter(Boolean) as string[];
  let wlClassMap: Record<string, Record<string, unknown>> = {};
  if (wlClassIds.length > 0) {
    const { data: wlClasses } = await adminClient
      .from('classes')
      .select('id, name, subject, level, group_size_type, meeting_day, meeting_time')
      .in('id', wlClassIds);
    for (const c of wlClasses || []) {
      wlClassMap[c.id] = c as Record<string, unknown>;
    }
  }

  // Resolve preferred_class_ids for SG/1:1 waitlist entries
  const allPreferredIds = (waitlistEntries || [])
    .filter((w: Record<string, unknown>) => !w.class_id && w.preferred_class_ids)
    .flatMap((w: Record<string, unknown>) => w.preferred_class_ids as string[]);
  let preferredClassMap: Record<string, { name: string | null; meeting_day: string; meeting_time: string; group_size_type: string }> = {};
  if (allPreferredIds.length > 0) {
    const { data: prefClasses } = await adminClient
      .from('classes')
      .select('id, name, meeting_day, meeting_time, group_size_type')
      .in('id', allPreferredIds);
    for (const c of prefClasses || []) {
      preferredClassMap[c.id] = { name: c.name, meeting_day: c.meeting_day, meeting_time: c.meeting_time, group_size_type: c.group_size_type };
    }
  }

  // Fetch all sibling slots for SG/1:1 waitlist entries (for Edit Slots form)
  const allSlotsForWaitlist: Record<string, Array<{ id: string; name: string | null; meeting_day: string; meeting_time: string }>> = {};
  const sgWaitlistEntries = (waitlistEntries || [])
    .filter((w: Record<string, unknown>) => !w.class_id && w.preferred_class_ids && w.status === 'waiting');
  if (sgWaitlistEntries.length > 0) {
    const firstPrefIds = (sgWaitlistEntries[0] as Record<string, unknown>).preferred_class_ids as string[] | null;
    const firstPrefId = firstPrefIds?.[0];
    if (firstPrefId && preferredClassMap[firstPrefId]) {
      const refClass = preferredClassMap[firstPrefId];
      const { data: siblingSlots } = await adminClient
        .from('classes')
        .select('id, name, meeting_day, meeting_time')
        .eq('group_size_type', refClass.group_size_type);
      const slots = (siblingSlots || []).map((c) => ({ id: c.id, name: c.name, meeting_day: c.meeting_day, meeting_time: c.meeting_time }));
      for (const wEntry of sgWaitlistEntries) {
        allSlotsForWaitlist[(wEntry as Record<string, unknown>).id as string] = slots;
      }
    }
  }

  // Credit balances
  const creditBalances = await getCreditBalance(adminClient, student.id);

  // Cancellations (separate batch queries — no nested joins that silently fail)
  const { data: cancellationsRaw } = await adminClient
    .from('session_cancellations')
    .select('*')
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

  // Makeup bookings for cancellations (cancellation-based + credit-based)
  const cancellationIds = (cancellationsRaw || []).map((c) => c.id as string);
  let makeupMap: Record<string, Record<string, unknown>> = {};
  if (cancellationIds.length > 0) {
    const { data: makeups } = await adminClient
      .from('makeup_bookings')
      .select('id, cancellation_id, credit_id, session_date, session_number, status, host_class_id')
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
  let classInfoMap: Record<string, { meeting_day: string; meeting_time: string; google_classroom_id: string | null; google_classroom_link: string | null; google_meet_link: string | null }> = {};
  // Also need subject+level from classes for cancellation credit redemption links
  let classInfoForCanc: Record<string, { subject: string; level: string }> = {};
  if (allClassIds.length > 0) {
    const { data: classRows } = await adminClient
      .from('classes')
      .select('id, meeting_day, meeting_time, google_classroom_id, google_classroom_link, google_meet_link, subject, level')
      .in('id', [...new Set(allClassIds)]);
    for (const row of classRows || []) {
      classInfoMap[row.id] = { meeting_day: row.meeting_day, meeting_time: row.meeting_time, google_classroom_id: row.google_classroom_id, google_classroom_link: row.google_classroom_link, google_meet_link: row.google_meet_link };
      classInfoForCanc[row.id] = { subject: row.subject || null, level: row.level || null };
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
      _classInfo: classInfoForCanc[c.class_id as string] || null,
    }));

  // Fetch slot 2 + slot 3 class info for multi-slot enrollments
  const extraSlotClassIds = new Set<string>();
  for (const e of (enrollments || []) as Record<string, unknown>[]) {
    if (e.slot_2_class_id) extraSlotClassIds.add(e.slot_2_class_id as string);
    if (e.slot_3_class_id) extraSlotClassIds.add(e.slot_3_class_id as string);
  }
  let slot2ClassMap: Record<string, Record<string, unknown>> = {};
  if (extraSlotClassIds.size > 0) {
    const { data: extraRows } = await adminClient
      .from('classes')
      .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, google_meet_link, google_classroom_id, google_classroom_enrollment_code, google_classroom_link, class_start_date, class_end_date')
      .in('id', Array.from(extraSlotClassIds));
    for (const row of extraRows || []) {
      slot2ClassMap[row.id] = row;
    }
  }

  // Perf lookup map: "classId-sessionNumber" -> { attendance, homework_completed }
  const perfMap = new Map<string, { attendance: boolean; homework_completed: boolean }>();
  for (const p of perfLogs || []) {
    perfMap.set(`${p.class_id}-${p.session_number}`, {
      attendance: p.attendance as boolean,
      homework_completed: p.homework_completed as boolean,
    });
  }

  const allNotifs = (notifications || []).filter((n) => n.type !== 'makeup');
  const makeupNotifs = (notifications || []).filter((n) => n.type === 'makeup');
  const unreadNotifs = allNotifs.filter((n) => !n.read);

  // Find admin/tutor user for messaging (use adminClient to bypass RLS)
  const { data: adminUsers } = await adminClient
    .from('users')
    .select('id, full_name')
    .eq('role', 'admin')
    .limit(1);

  const tutorId = adminUsers?.[0]?.id || null;
  const tutorName = adminUsers?.[0]?.full_name || 'Tutor';

  // Check classroom membership for enrollments not yet joined
  const studentEmail = student.email || user.email;
  const unjoinedEnrollments = (enrollments || []).filter(
    (e) => !e.classroom_joined && (e.classes as Record<string, unknown>)?.google_classroom_id
  );
  const classroomJoinedSet = new Set<string>();
  if (studentEmail && unjoinedEnrollments.length > 0) {
    const checks = await Promise.allSettled(
      unjoinedEnrollments.map(async (e) => {
        const cls = e.classes as Record<string, unknown>;
        const joined = await isStudentInClassroom(cls.google_classroom_id as string, studentEmail);
        if (joined) {
          await adminClient.from('enrollments').update({ classroom_joined: true }).eq('id', e.id);
          classroomJoinedSet.add(e.id as string);
        }
      })
    );
    // Log any failures but don't block
    checks.forEach((r, i) => {
      if (r.status === 'rejected') console.error('Classroom check failed:', r.reason);
    });
  }

  // Route prefix for links (independent students use /student, parent-managed use no action links)
  const actionPrefix = isIndependent ? '/student' : null;

  // Build calendar session events
  const calendarSessions: { studentName: string; className: string | null; meetingDay: string; meetingTime: string; sessionNumber: number; sessionDate: string; isCancelled: boolean; isMakeup: boolean; isPast: boolean; googleMeetLink: string | null; makeupDate?: string | null; originalDate?: string | null }[] = [];
  const studentName = user.user_metadata?.full_name || 'Me';
  for (const e of (enrollments || []) as Record<string, unknown>[]) {
    const cls = e.classes as Record<string, string> | null;
    const slot2Class = e.slot_2_class_id ? slot2ClassMap[e.slot_2_class_id as string] : null;
    const slot3Class = e.slot_3_class_id ? slot2ClassMap[e.slot_3_class_id as string] : null;
    const startDate = (e.student_start_date as string) || cls?.class_start_date;
    const slot1ClassId = (e.slot_1_class_id as string) || (e.class_id as string);
    const slot2ClassId = e.slot_2_class_id as string | null;
    const slot3ClassId = e.slot_3_class_id as string | null;
    if (!startDate || !cls) continue;
    const calSessions = computeEnrollmentSessions(
      startDate,
      { classId: slot1ClassId, meetingDay: cls.meeting_day },
      slot2ClassId && slot2Class ? { classId: slot2ClassId, meetingDay: slot2Class.meeting_day as string } : null,
      slot3ClassId && slot3Class ? { classId: slot3ClassId, meetingDay: slot3Class.meeting_day as string } : null
    );
    const enrollCancellations = cancellations.filter(
      (c) => (c.enrollment_id as string) === (e.id as string) || (c.class_id as string) === (e.class_id as string)
    );
    for (const sess of calSessions) {
      const cancellation = enrollCancellations.find((c) => (c.session_number as number) === sess.sessionNumber);
      const isCancelled = !!cancellation && ['cancelled', 'absent'].includes(cancellation.status as string);
      const meetLink = slot2ClassId && sess.classId === slot2ClassId && slot2Class
        ? slot2Class.google_meet_link as string : cls.google_meet_link;
      const meetTime = slot2ClassId && sess.classId === slot2ClassId && slot2Class
        ? slot2Class.meeting_time as string : cls.meeting_time;
      const makeup = cancellation
        ? (cancellation as Record<string, unknown>)._makeup as Record<string, unknown> | null
        : null;
      const hasMakeup = makeup && (makeup.status === 'booked' || makeup.status === 'attended');
      const makeupClass = cancellation
        ? (cancellation as Record<string, unknown>)._makeupClass as Record<string, string> | null
        : null;

      calendarSessions.push({
        studentName,
        className: cls.name,
        meetingDay: sess.date.toLocaleDateString('en-US', { weekday: 'long' }),
        meetingTime: meetTime,
        sessionNumber: sess.sessionNumber,
        sessionDate: sess.dateStr,
        isCancelled,
        isMakeup: false,
        isPast: sess.isPast,
        googleMeetLink: meetLink || null,
        makeupDate: isCancelled && hasMakeup ? (makeup!.session_date as string) : null,
      });
      if (hasMakeup) {
        calendarSessions.push({
          studentName,
          className: cls.name,
          meetingDay: new Date((makeup!.session_date as string) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
          meetingTime: makeupClass?.meeting_time || cls.meeting_time,
          sessionNumber: sess.sessionNumber,
          sessionDate: makeup!.session_date as string,
          isCancelled: false,
          isMakeup: true,
          isPast: new Date((makeup!.session_date as string) + 'T00:00:00') < new Date(new Date().toISOString().split('T')[0] + 'T00:00:00'),
          googleMeetLink: makeupClass?.google_meet_link || null,
          originalDate: sess.dateStr,
        });
      }
    }
  }

  // Action items = things requiring user action
  type ActionItem = { type: 'payment' | 'classroom' | 'makeup'; message: string; enrollmentId?: string; deadline?: string | null; cancellationId?: string };
  const actionItems: ActionItem[] = [];
  // Reminders = informational (consultations, booked makeups)
  const reminders: ReminderItem[] = [];

  for (const e of (enrollments || []) as Record<string, unknown>[]) {
    const enrollmentId = e.id as string;
    const cls = e.classes as Record<string, unknown> | null;
    const className = (cls?.name as string) || 'Class';
    if (e.payment_status === 'unpaid') {
      const deadline = e.payment_deadline as string | null;
      actionItems.push({
        type: 'payment',
        message: `Payment due${deadline ? ` by ${new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''} — ${className}`,
        enrollmentId,
        deadline,
      });
    }
    if ((cls?.google_classroom_enrollment_code as string) && !e.classroom_joined && !classroomJoinedSet.has(enrollmentId)) {
      actionItems.push({
        type: 'classroom',
        message: `You haven't joined the Google Classroom for ${className}`,
      });
    }
  }
  // Cancelled sessions
  for (const c of cancellations) {
    if ((c.status as string) !== 'cancelled') continue;
    const sessionDate = c.session_date as string;
    const sessionNum = c.session_number as number;
    const makeup = (c as Record<string, unknown>)._makeup as Record<string, unknown> | null;
    const makeupClass = (c as Record<string, unknown>)._makeupClass as Record<string, string> | null;
    if (makeup) {
      const makeupDate = new Date((makeup.session_date as string) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const makeupTime = makeupClass ? formatTime(makeupClass.meeting_time) : '';
      reminders.push({
        id: `makeup-${c.id}`,
        type: 'makeup',
        message: `Session ${sessionNum} (${sessionDate}) → Makeup on ${makeupDate}${makeupTime ? ` at ${makeupTime}` : ''}`,
      });
    } else {
      actionItems.push({
        type: 'makeup',
        message: `Session ${sessionNum} (${sessionDate}) needs a makeup`,
        cancellationId: c.id as string,
      });
    }
  }
  // Consultations → reminders
  if (isIndependent && existingBookings && existingBookings.length > 0) {
    for (const booking of existingBookings) {
      const dt = new Date(booking.datetime);
      const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const isRefund = booking.booking_type === 'refund';
      reminders.push({
        id: `consult-${booking.id}`,
        type: 'consultation',
        message: `${isRefund ? 'Refund consultation' : 'Consultation'} on ${dateStr} at ${timeStr}`,
        meetLink: booking.meet_link,
        meetingType: booking.meeting_type,
      });
    }
  }
  // DB makeup notifications → reminders
  for (const n of makeupNotifs) {
    reminders.push({ id: `notif-${n.id}`, type: 'makeup', message: n.message, notificationId: n.id });
  }

  return (
    <div>
      {/* Header — flat style, matches nav-level pages */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Student Dashboard</h1>
        <p className="text-slate-500 mb-4">View your classes, sessions, and credits.</p>
        {isIndependent && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Link
                href="/enroll"
                className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-400 text-center col-span-2 sm:col-span-1"
              >
                Enroll
              </Link>
              {(!existingBookings || existingBookings.length === 0) && (
                <Link
                  href="/book"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 text-center"
                >
                  Consultation
                </Link>
              )}
              <Link
                href="/student/cancel-session"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 text-center"
              >
                Cancel Session
              </Link>
              <Link
                href="/student/drop-class"
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 text-center"
              >
                Drop Class
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Action Items — things requiring user action */}
      {actionItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
          <div className="px-5 py-2.5 border-b border-amber-200/60 flex items-center gap-2">
            <span className="text-amber-600 text-sm">&#9888;</span>
            <h2 className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Action Items ({actionItems.length})
            </h2>
          </div>
          <div className="divide-y divide-amber-100">
            {actionItems.map((item, i) => (
              <div key={`action-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  item.type === 'payment' ? (item.deadline && Math.ceil((new Date(item.deadline + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 3 ? 'bg-red-500' : 'bg-yellow-500') :
                  item.type === 'classroom' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900">{item.message}</p>
                </div>
                {item.type === 'payment' && item.enrollmentId && (
                  <PayNowButton enrollmentId={item.enrollmentId} />
                )}
                {item.type === 'makeup' && item.cancellationId && (
                  <Link
                    href={`/student/cancel-session/alternate?cancellation_id=${item.cancellationId}`}
                    className="rounded-lg bg-navy-900 px-3 py-1.5 text-white text-xs font-medium hover:bg-navy-800 shrink-0"
                  >
                    Find Makeup
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reminders — informational (consultations, booked makeups) */}
      <RemindersList reminders={reminders} />

      {/* Credit Balances */}
      {Object.entries(creditBalances).filter(([, v]) => v > 0).length > 0 && (
        <div className="mb-6 border-l-4 border-gold-500 bg-gold-50 rounded-r-lg px-5 py-4">
          <h2 className="text-xs font-bold text-gold-600 uppercase tracking-widest mb-2">Credits</h2>
          <div className="flex gap-4">
            {Object.entries(creditBalances)
              .filter(([, v]) => v > 0)
              .map(([type, count]) => (
                <span key={type} className="text-sm text-navy-900">
                  <span className="font-semibold">{count}</span> {type.replace('_', ' ')}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      {allNotifs.length > 0 && (
        <div id="notifications" className="mb-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Notifications{unreadNotifs.length > 0 ? ` (${unreadNotifs.length} new)` : ''}
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {allNotifs.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 px-5 py-3 ${n.read ? 'opacity-60' : ''}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-slate-300' : getNotifDotColor(n.message)}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.read ? 'text-slate-500' : 'text-navy-900'}`}>{n.message}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read && <MarkReadButton notificationId={n.id} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Office Hours */}
      {officeHours && officeHours.length > 0 && (
        <div className="mb-6 border-l-4 border-success bg-success-light rounded-r-lg px-5 py-4">
          <h2 className="text-xs font-bold text-success uppercase tracking-widest mb-2">Office Hours</h2>
          {officeHours.map((oh) => (
            <div key={oh.id} className="flex items-center justify-between">
              <p className="text-sm text-navy-900 font-medium">
                {oh.day_of_week}s, {formatTime(oh.start_time)} – {formatTime(oh.end_time)}
              </p>
              <a
                href={oh.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-navy-900 px-4 py-1.5 text-white text-sm font-medium hover:bg-navy-800"
              >
                Join
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Enrollments */}
      <DashboardViewToggle sessions={calendarSessions} listLabel="Class">
      {(!enrollments || enrollments.length === 0) && (
        <div className="text-center py-12 rounded-xl bg-white border border-slate-200 mb-6">
          <div className="w-16 h-16 rounded-full bg-navy-100 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-navy-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
          </div>
          <p className="text-navy-900 font-medium mb-1">No active enrollments</p>
          <p className="text-slate-400 text-sm mb-5">
            {isIndependent ? 'Browse available courses to get started.' : 'Ask your parent to enroll you in a course.'}
          </p>
          {isIndependent && (
            <Link href="/enroll" className="rounded-lg bg-gold-500 px-5 py-2.5 text-navy-950 text-sm font-semibold hover:bg-gold-400">
              Browse Courses
            </Link>
          )}
        </div>
      )}

      <div className="space-y-6">
        {enrollments?.map((e: Record<string, unknown>) => {
          const cls = e.classes as Record<string, unknown>;
          const enrollmentId = e.id as string;
          const classId = e.class_id as string;
          const slot1ClassId = e.slot_1_class_id as string | null;
          const slot2ClassId = e.slot_2_class_id as string | null;
          const slot2Class = slot2ClassId ? slot2ClassMap[slot2ClassId] : null;

          const startDate = (e.student_start_date as string) || (cls?.class_start_date as string);
          const slot3ClassId = e.slot_3_class_id as string | null;
          const slot3Class = slot3ClassId ? slot2ClassMap[slot3ClassId] : null;

          // Cancellations for this enrollment (match enrollment_id or any slot class_id)
          const enrollClassIds = new Set([classId, slot1ClassId, slot2ClassId, slot3ClassId].filter(Boolean) as string[]);
          const enrollCancellations = cancellations.filter(
            (c) => (c.enrollment_id as string) === enrollmentId || enrollClassIds.has(c.class_id as string)
          );
          const sessions = startDate
            ? computeEnrollmentSessions(
                startDate,
                { classId: slot1ClassId || classId, meetingDay: cls?.meeting_day as string },
                slot2ClassId && slot2Class
                  ? { classId: slot2ClassId, meetingDay: slot2Class.meeting_day as string }
                  : null,
                slot3ClassId && slot3Class
                  ? { classId: slot3ClassId, meetingDay: slot3Class.meeting_day as string }
                  : null
              )
            : [];
          const nextSession = sessions.find((s) => !s.isPast);

          return (
            <div key={enrollmentId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Enrollment header */}
              <div className="bg-white px-4 py-4 flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:justify-between sm:items-start sm:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-navy-900">{cls?.name as string}</h2>
                    {(e as Record<string, unknown>).payment_status === 'paid' && (
                      <span className="text-xs bg-navy-100 text-navy-700 px-2 py-0.5 rounded-full font-medium">
                        Paid
                      </span>
                    )}
                  </div>
                  {(() => {
                    const subCat = (e as Record<string, unknown>).subject_category as string | null;
                    const subDetail = (e as Record<string, unknown>).subject_detail as string | null;
                    const label = subCat ? formatSubjectCategory(subCat, subDetail) : (cls?.subject ? (cls.subject as string).replace('_', ' ') + (cls?.level ? ` — ${cls.level as string}` : '') : null);
                    return label ? (
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mt-0.5">
                        {label}
                      </p>
                    ) : null;
                  })()}
                  <p className="text-sm text-slate-500">
                    {(() => {
                      const slots = [{ day: cls?.meeting_day as string, time: cls?.meeting_time as string }];
                      if (slot2Class) slots.push({ day: slot2Class.meeting_day as string, time: slot2Class.meeting_time as string });
                      if (slot3Class) slots.push({ day: slot3Class.meeting_day as string, time: slot3Class.meeting_time as string });
                      slots.sort((a, b) => dayIndex(a.day) - dayIndex(b.day));
                      return slots.map((s, i) => (
                        <span key={i}>{i > 0 ? ' & ' : ''}{s.day}s at {formatTime(s.time)}</span>
                      ));
                    })()}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{(cls?.group_size_type as string)?.replace('_', ' ')} group</p>
                </div>
              </div>
              <div className="p-4 sm:p-6">

              {/* Alerts — grouped together */}
              {((e as Record<string, unknown>).payment_status === 'unpaid' || ((cls?.google_classroom_enrollment_code as string) && !e.classroom_joined && !classroomJoinedSet.has(enrollmentId))) && (
                <div className="mb-4 space-y-2">
                  {(e as Record<string, unknown>).payment_status === 'unpaid' && (
                    <div className={`rounded px-3 py-2 flex items-center justify-between ${
                      (() => {
                        const deadline = (e as Record<string, unknown>).payment_deadline as string | null;
                        if (!deadline) return 'bg-yellow-50 border border-yellow-200';
                        const daysLeft = Math.ceil((new Date(deadline + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return daysLeft <= 3 ? 'bg-error-light border border-red-200' : 'bg-yellow-50 border border-yellow-200';
                      })()
                    }`}>
                      <p className={`text-xs font-medium ${
                        (() => {
                          const deadline = (e as Record<string, unknown>).payment_deadline as string | null;
                          if (!deadline) return 'text-yellow-800';
                          const daysLeft = Math.ceil((new Date(deadline + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          return daysLeft <= 3 ? 'text-red-800' : 'text-yellow-800';
                        })()
                      }`}>
                        Payment due by {(e as Record<string, unknown>).payment_deadline
                          ? new Date(((e as Record<string, unknown>).payment_deadline as string) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                          : 'TBD'}
                      </p>
                      <PayNowButton enrollmentId={enrollmentId} />
                    </div>
                  )}
                  {(cls?.google_classroom_enrollment_code as string) && !e.classroom_joined && !classroomJoinedSet.has(enrollmentId) && (
                    <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                      <strong>Action required:</strong> Please join the Google Classroom for this class.{' '}
                      <a
                        href="https://classroom.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline hover:text-yellow-900"
                      >
                        Go to Google Classroom
                      </a>
                      <span className="ml-2">
                        (Code: <span className="font-mono font-bold select-all">{cls.google_classroom_enrollment_code as string}</span>)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Links */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {(() => {
                  const todayStr = new Date().toISOString().split('T')[0];

                  // Build a list of all upcoming events: regular sessions + makeup sessions
                  type UpcomingEvent = { dateStr: string; sessionNumber: number; isMakeup: boolean; meetLink: string | null };
                  const upcoming: UpcomingEvent[] = [];

                  for (const sess of sessions) {
                    if (sess.isPast) continue;
                    // Check if this session is cancelled
                    const canc = enrollCancellations.find((c) => (c.session_number as number) === sess.sessionNumber);
                    const isCancelled = !!canc;
                    const makeup = canc ? (canc as Record<string, unknown>)._makeup as Record<string, unknown> | null : null;
                    const makeupClass = canc ? (canc as Record<string, unknown>)._makeupClass as { google_meet_link: string | null } | null : null;
                    const hasBookedMakeup = makeup && makeup.status === 'booked';

                    if (isCancelled && hasBookedMakeup) {
                      // Add the makeup session instead
                      const makeupDateStr = makeup.session_date as string;
                      if (makeupDateStr >= todayStr) {
                        upcoming.push({
                          dateStr: makeupDateStr,
                          sessionNumber: sess.sessionNumber,
                          isMakeup: true,
                          meetLink: makeupClass?.google_meet_link || null,
                        });
                      }
                    } else if (!isCancelled) {
                      // Regular upcoming session
                      const regularMeetLink = slot2ClassId && sess.classId === slot2ClassId && slot2Class
                        ? (slot2Class.google_meet_link as string)
                        : (cls?.google_meet_link as string);
                      upcoming.push({
                        dateStr: sess.dateStr,
                        sessionNumber: sess.sessionNumber,
                        isMakeup: false,
                        meetLink: regularMeetLink,
                      });
                    }
                  }

                  // Sort by date and pick the earliest
                  upcoming.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
                  const next = upcoming[0];

                  if (!next?.meetLink) {
                    // Fallback: no upcoming sessions with meet links
                    const fallbackLink = cls?.google_meet_link as string;
                    if (!fallbackLink) return null;
                    return (
                      <a href={fallbackLink} target="_blank" rel="noopener noreferrer"
                        className="inline-block rounded border px-4 py-1.5 text-sm font-medium hover:bg-navy-50">
                        Join Class
                      </a>
                    );
                  }

                  const dateLabel = new Date(next.dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const sessionLabel = next.isMakeup
                    ? `Join Make Up Session — ${dateLabel}`
                    : `Join Session — ${dateLabel}`;

                  return (
                    <a href={next.meetLink} target="_blank" rel="noopener noreferrer"
                      className="inline-block rounded border px-4 py-1.5 text-sm font-medium hover:bg-navy-50">
                      {sessionLabel}
                    </a>
                  );
                })()}
                {(cls?.google_classroom_link as string) && (e.classroom_joined || classroomJoinedSet.has(enrollmentId)) && (
                  <a
                    href={cls.google_classroom_link as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded border px-3 py-1.5 text-sm font-medium hover:bg-navy-50"
                  >
                    Google Classroom
                  </a>
                )}
              </div>

              {/* Session Schedule + Performance */}
              {sessions.length > 0 && (() => {
                // Build unified session cards with performance data
                const cards: SessionPerfCard[] = [];

                for (const sess of sessions) {
                  const d = sess.date;
                  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  const isNext = nextSession?.sessionNumber === sess.sessionNumber;
                  const cancellation = enrollCancellations.find(
                    (c) => (c.session_number as number) === sess.sessionNumber
                  );
                  const isCancelled = cancellation && ((cancellation.status as string) === 'cancelled');
                  const isAbsent = cancellation && (cancellation.status as string) === 'absent';
                  const hasBookedMakeup = cancellation && (cancellation as Record<string, unknown>)._makeup && ((cancellation as Record<string, unknown>)._makeup as Record<string, unknown>)?.status === 'booked';

                  // Look up performance for this session's class + session number
                  const perf = perfMap.get(`${sess.classId}-${sess.sessionNumber}`);

                  cards.push({
                    key: `s-${sess.sessionNumber}`,
                    sessionNumber: sess.sessionNumber,
                    dateLabel: label,
                    dateStr: sess.dateStr,
                    isPast: sess.isPast,
                    isNext,
                    status: isCancelled || hasBookedMakeup ? 'cancelled' : isAbsent ? 'absent' : 'normal',
                    attendance: perf?.attendance,
                    homeworkCompleted: perf?.homework_completed,
                  });
                }

                // Add makeup session cards with their performance
                for (const c of enrollCancellations) {
                  const makeup = (c as Record<string, unknown>)._makeup as Record<string, unknown> | null;
                  if (makeup && (makeup.status === 'booked' || makeup.status === 'attended')) {
                    const makeupDateStr = makeup.session_date as string;
                    const makeupDate = new Date(makeupDateStr + 'T00:00:00');
                    const makeupLabel = makeupDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    // Look up perf for makeup: class_id = host_class_id, session_number = makeup's session_number
                    const makeupPerf = perfMap.get(`${makeup.host_class_id}-${makeup.session_number}`);

                    cards.push({
                      key: `makeup-${c.id}`,
                      sessionNumber: c.session_number as number,
                      dateLabel: makeupLabel,
                      dateStr: makeupDateStr,
                      isPast: new Date(makeupDateStr + 'T00:00:00') < new Date(),
                      isNext: false,
                      status: 'makeup',
                      attendance: makeupPerf?.attendance,
                      homeworkCompleted: makeupPerf?.homework_completed,
                    });
                  }
                }

                cards.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

                return (
                  <div className="mb-4">
                    <SessionPerformance sessions={cards} />
                  </div>
                );
              })()}

              {/* Cancellations inline */}
              {enrollCancellations.length > 0 && (
                <div className="mb-4 border-t border-gray-200 pt-3 space-y-1.5">
                  {enrollCancellations.map((c) => {
                    const origClass = c._originalClass as { meeting_day: string; meeting_time: string; google_classroom_id: string | null; google_classroom_link: string | null; google_meet_link: string | null } | null;
                    const makeup = c._makeup as Record<string, unknown> | null;
                    const makeupClass = c._makeupClass as { meeting_day: string; meeting_time: string; google_classroom_id: string | null; google_classroom_link: string | null; google_meet_link: string | null } | null;

                    return (
                      <div key={c.id as string} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-red-500">&#10005;</span>
                          <span className="text-slate-600">
                            Session {c.session_number as number} — {c.session_date as string}
                            {origClass ? ` (${origClass.meeting_day} ${formatTime(origClass.meeting_time)})` : ''}
                          </span>
                          {makeup && (
                            <span className="text-blue-600">
                              → Makeup {makeupClass?.meeting_day || ''} {formatTime(makeupClass?.meeting_time)} ({makeup.session_date as string})
                            </span>
                          )}
                          {!makeup && c.status === 'absent' && (
                            <span className="text-amber-600">— Absent{!isIndependent ? ' (parent can submit excuse)' : ''}</span>
                          )}
                          {!makeup && c.status === 'expired' && (
                            <span className="text-slate-400">— Expired</span>
                          )}
                        </div>
                        {/* Action button group */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                          {makeup && makeup.status === 'booked' && (
                            <CancelMakeupButton bookingId={makeup.id as string} />
                          )}
                          {!makeup && c.status === 'absent' && isIndependent && (
                            <ExcuseNoteForm
                              cancellationId={c.id as string}
                              deadline={new Date(new Date(c.session_date as string).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()}
                              submitAction={submitExcuseNote}
                            />
                          )}
                          {!makeup && c.status === 'cancelled' && actionPrefix && (
                            <Link
                              href={`${actionPrefix}/cancel-session/alternate?cancellation_id=${c.id}`}
                              className="inline-flex items-center rounded-md border border-navy-200 px-3 py-1 text-[11px] font-medium text-navy-700 hover:bg-navy-50"
                            >
                              {['one_on_one', 'small'].includes(c.group_size_type as string) ? 'Find Makeup' : 'Find Alternate'}
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>
      </DashboardViewToggle>

      {/* Enrollment Waitlist */}
      {waitlistEntries && waitlistEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-bold text-gold-600 uppercase tracking-widest mb-3">Enrollment Waitlist</h2>
          <div className="space-y-2">
            {waitlistEntries.map((w: Record<string, unknown>) => {
              const classObj = w.class_id ? wlClassMap[w.class_id as string] : null;
              const hasOffer = w.status === 'notified' && !!w.offer_expires_at;
              const prefIds = (w.preferred_class_ids as string[] | null) || [];
              const isSgEntry = !w.class_id && prefIds.length > 0;
              const firstPrefInfo = prefIds.length > 0 ? preferredClassMap[prefIds[0]] : null;
              const gsLabel = firstPrefInfo?.group_size_type === 'one_on_one' ? '1:1' : 'Small Group';
              return (
                <div key={w.id as string} className={`rounded px-4 py-2 text-sm ${hasOffer ? 'bg-success-light border border-green-200' : 'bg-amber-50'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      {isSgEntry ? (
                        <span className="font-medium">{gsLabel} Waitlist</span>
                      ) : (
                        <>
                          <span className="font-medium">{(classObj?.name as string) || 'Class'}</span>
                          <span className="text-slate-500 ml-2">
                            {(classObj?.meeting_day as string) || ''} {formatTime(classObj?.meeting_time as string)}
                          </span>
                        </>
                      )}
                      <span className="text-slate-400 ml-2 text-xs">{new Date(w.created_at as string).toLocaleDateString()}</span>
                    </div>
                    <span className={`capitalize text-xs px-2 py-0.5 rounded ${
                      hasOffer
                        ? 'bg-green-100 text-green-800'
                        : w.status === 'notified'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {hasOffer ? 'spot available' : (w.status as string) === 'notified' ? 'notified' : 'waiting'}
                    </span>
                  </div>
                  {isSgEntry && prefIds.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      Preferred slots:{' '}
                      {prefIds.map((pid) => {
                        const pc = preferredClassMap[pid];
                        return pc ? `${pc.meeting_day} ${formatTime(pc.meeting_time)}` : 'Unknown';
                      }).join(', ')}
                    </div>
                  )}
                  {hasOffer && (
                    <div className="mt-2 flex items-center gap-3">
                      <a
                        href={`/enroll/waitlist-offer/${w.id as string}`}
                        className="text-sm font-medium text-green-700 underline hover:text-green-900"
                      >
                        Accept by {new Date(w.offer_expires_at as string).toLocaleDateString()}
                      </a>
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <LeaveWaitlistButton waitlistId={w.id as string} />
                    {isSgEntry && w.status === 'waiting' && allSlotsForWaitlist[w.id as string] && (
                      <EditPreferredSlotsForm
                        waitlistId={w.id as string}
                        currentSlotIds={prefIds}
                        availableSlots={allSlotsForWaitlist[w.id as string]}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Makeup Waitlist */}
      {makeupWaitlistEntries && makeupWaitlistEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-bold text-gold-600 uppercase tracking-widest mb-3">Makeup Waitlist</h2>
          <div className="space-y-2">
            {makeupWaitlistEntries.map((mw: Record<string, unknown>) => {
              const mwCls = mw.classes as Record<string, unknown> | Record<string, unknown>[];
              const classInfo = Array.isArray(mwCls) ? mwCls[0] : mwCls;
              return (
                <div key={mw.id as string} className="flex justify-between items-center bg-amber-50 rounded px-4 py-2 text-sm">
                  <div>
                    <span className="font-medium">Session {mw.session_number as number}</span>
                    <span className="text-slate-500 ml-2">
                      {(classInfo?.meeting_day as string) || ''} {formatTime(classInfo?.meeting_time as string)}
                    </span>
                    <span className="text-slate-400 ml-2 text-xs">{mw.session_date as string}</span>
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

      {/* Messages — only for independent students (parents message from their own dashboard) */}
      {isIndependent && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="bg-white px-6 py-3 border-b border-slate-200">
            <h2 className="text-base font-semibold text-navy-900">Message Your Tutor</h2>
          </div>
          <div className="p-6">
          {tutorId ? (
            <>
              {recentMessages && recentMessages.length > 0 && (
                <div className="mb-4 max-h-72 overflow-y-auto space-y-3 flex flex-col-reverse">
                  <div className="space-y-3">
                    {recentMessages.map((msg) => {
                      const isMine = msg.from_user_id === user.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                            isMine
                              ? 'bg-navy-900 text-white rounded-br-md'
                              : 'bg-slate-100 text-navy-900 rounded-bl-md'
                          }`}>
                            <p>{msg.body}</p>
                            <div className={`flex items-center gap-2 mt-1 text-[11px] ${isMine ? 'text-navy-400' : 'text-slate-400'}`}>
                              <span>{isMine ? 'You' : tutorName}</span>
                              <span>&middot;</span>
                              <span>{(() => {
                                const diff = Date.now() - new Date(msg.created_at).getTime();
                                const mins = Math.floor(diff / 60000);
                                if (mins < 60) return `${mins}m ago`;
                                const hrs = Math.floor(mins / 60);
                                if (hrs < 24) return `${hrs}h ago`;
                                return `${Math.floor(hrs / 24)}d ago`;
                              })()}</span>
                              {isMine && <DeleteMessageButton messageId={msg.id} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <MessageForm tutorId={tutorId} />
            </>
          ) : (
            <p className="text-sm text-slate-400">No tutor available for messaging.</p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
