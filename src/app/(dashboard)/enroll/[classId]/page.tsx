import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import { formatPrice } from '@/lib/stripe/prices';
import { getPriceForEnrollment, formatTime } from '@/lib/constants';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';
import EnrollForm from './enroll-form';
import WaitlistForm from './waitlist-form';
import SgWaitlistForm from './sg-waitlist-form';
import Link from 'next/link';

export default async function ClassEnrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ slot2?: string; waitlist_slots?: string }>;
}) {
  const { classId } = await params;
  const { slot2: slot2Id, waitlist_slots: waitlistSlotsParam } = await searchParams;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Fetch slot 1 class
  const { data: slot1 } = await supabase
    .from('classes')
    .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, capacity, class_start_date, class_end_date, enrollment_window_start, enrollment_window_end')
    .eq('id', classId)
    .single();

  if (!slot1) notFound();

  // Check if enrollment window has closed (today > end date means closed; last day is still open)
  if (slot1.group_size_type !== 'large' && slot1.enrollment_window_end) {
    const today = new Date().toISOString().split('T')[0];
    if (today > slot1.enrollment_window_end) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Enrollment Closed</h1>
            <p className="text-slate-500">{slot1.name || 'Class'}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-500 mb-4">
              The enrollment window for this class ended on {slot1.enrollment_window_end}.
            </p>
            <Link href="/enroll" className="text-sm font-medium text-navy-900 hover:text-navy-700">
              Browse other classes
            </Link>
          </div>
        </div>
      );
    }
  }

  // Fetch slot 2 class if provided (LG is always single-slot)
  let slot2: typeof slot1 | null = null;
  if (slot2Id && slot1.group_size_type !== 'large') {
    const { data } = await supabase
      .from('classes')
      .select('id, name, subject, level, group_size_type, meeting_day, meeting_time, meeting_day_2, meeting_time_2, capacity, class_start_date, class_end_date, enrollment_window_start, enrollment_window_end')
      .eq('id', slot2Id)
      .single();
    slot2 = data;

    // Validate slot2 compatibility (same group_size_type, different day)
    if (slot2 && (slot2.group_size_type !== slot1.group_size_type || slot2.meeting_day === slot1.meeting_day)) {
      slot2 = null; // Incompatible — ignore
    }
  }

  const slotCount = slot2 ? 2 : 1;
  const groupSizeType = slot1.group_size_type;

  // For SG and 1:1, must pick exactly 2 slots
  const needsSecondSlot = (groupSizeType === 'small' || groupSizeType === 'one_on_one') && !slot2;

  // Get enrollment counts for both slots (slot-aware)
  const slotIds = [classId, ...(slot2 ? [slot2.id] : [])];
  const { data: enrollmentRows } = await adminSupabase
    .from('enrollments')
    .select('slot_1_class_id, slot_2_class_id, class_id')
    .in('status', ['pending', 'active']);

  function countForClass(targetId: string): number {
    let count = 0;
    (enrollmentRows || []).forEach((row: Record<string, unknown>) => {
      if (row.slot_1_class_id === targetId || row.slot_2_class_id === targetId || row.class_id === targetId) count++;
    });
    return count;
  }

  const slot1Enrolled = countForClass(classId);
  const slot1Full = slot1Enrolled >= slot1.capacity;
  const slot2Enrolled = slot2 ? countForClass(slot2.id) : 0;
  const slot2Full = slot2 ? slot2Enrolled >= slot2.capacity : false;

  const anyFull = slot1Full || slot2Full;

  const price = getPriceForEnrollment(groupSizeType);

  // Get current user's students
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();

  function normalizeStudents(data: Record<string, unknown>[] | null) {
    return (data || []).map((s) => {
      const u = s.users as unknown as Record<string, string> | Record<string, string>[] | null;
      const name = Array.isArray(u) ? u[0]?.full_name : u?.full_name;
      const studentName = name || (s.full_name as string) || 'Unknown';
      return { id: s.id as string, user: { full_name: studentName } };
    });
  }

  if (profile?.role !== 'parent' && profile?.role !== 'student') redirect(`/${profile?.role || ''}`);

  let students: Array<{ id: string; user: { full_name: string } }> = [];

  if (profile?.role === 'parent') {
    const { data } = await adminSupabase
      .from('students')
      .select('id, users!students_user_id_fkey(full_name)')
      .eq('parent_id', user.id);
    students = normalizeStudents(data as Record<string, unknown>[] | null);
  } else {
    const { data } = await adminSupabase
      .from('students')
      .select('id, parent_id, users!students_user_id_fkey(full_name)')
      .eq('user_id', user.id);
    const allStudentRows = (data || []) as Record<string, unknown>[];
    const isParentLinked = allStudentRows.length > 0 && allStudentRows[0].parent_id != null;
    if (isParentLinked) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">{slot1.name || 'Class'}</h1>
            <p className="text-slate-500">{slot1.name || 'Class'}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-slate-600">
              Your parent manages your enrollments. Please ask them to enroll you.
            </p>
          </div>
        </div>
      );
    }
    students = normalizeStudents(allStudentRows);
  }

  // Check eligibility for each student
  const eligibleStudents: typeof students = [];
  const ineligibleStudents: Array<{ id: string; name: string; reason: string }> = [];

  for (const s of students) {
    const result = await checkEligibility(adminSupabase, s.id, classId, slot2?.id);
    if (result.eligible) {
      eligibleStudents.push(s);
    } else {
      ineligibleStudents.push({ id: s.id, name: s.user.full_name, reason: result.reason || 'Not eligible' });
    }
  }

  // Fetch all matching slots for this group_size_type (subject-agnostic for SG/1:1)
  let allMatchingSlots: Array<{ id: string; name: string | null; meeting_day: string; meeting_time: string; capacity: number }> = [];
  if (groupSizeType === 'small' || groupSizeType === 'one_on_one') {
    const { data: otherSlots } = await supabase
      .from('classes')
      .select('id, name, meeting_day, meeting_time, capacity')
      .eq('group_size_type', groupSizeType)
      .eq('active', true);

    allMatchingSlots = (otherSlots || []) as typeof allMatchingSlots;
  }

  // Parse waitlist_slots param (pre-selected from browse grid)
  const preSelectedWaitlistIds = waitlistSlotsParam
    ? waitlistSlotsParam.split(',').filter(Boolean)
    : [];

  const groupLabel = groupSizeType === 'one_on_one' ? '1:1 Private' : groupSizeType === 'small' ? 'Small Group' : 'Large Group';

  // If waitlist_slots provided, skip slot picker and go straight to waitlist form
  if (preSelectedWaitlistIds.length >= 2 && (groupSizeType === 'small' || groupSizeType === 'one_on_one')) {
    // Re-check eligibility with skipCapCheck — capacity isn't a blocker for waitlist
    const wlEligible: typeof students = [];
    const wlIneligible: Array<{ id: string; name: string; reason: string }> = [];
    for (const s of students) {
      const result = await checkEligibility(adminSupabase, s.id, classId, slot2?.id, null, { skipCapCheck: true });
      if (result.eligible) {
        wlEligible.push(s);
      } else {
        wlIneligible.push({ id: s.id, name: s.user.full_name, reason: result.reason || 'Not eligible' });
      }
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Join Waitlist</h1>
          <p className="text-slate-500">
            {groupLabel} — {formatPrice(getPriceForEnrollment(groupSizeType))}/mo
          </p>
          {slot1.enrollment_window_start && slot1.enrollment_window_end && (
            <p className="text-xs text-slate-400 mt-1">
              Current enrollment window: {slot1.enrollment_window_start} – {slot1.enrollment_window_end}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {wlEligible.length === 0 ? (
              <div className="py-8 text-center">
                {students.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    {profile?.role === 'parent' ? (
                      <>No students on your account.{' '}<a href="/parent/add-student" className="underline">Add a student</a> first.</>
                    ) : (
                      'Student profile not found. Please contact support.'
                    )}
                  </p>
                ) : (
                  <p className="text-slate-600">None of your students are eligible for this class.</p>
                )}
              </div>
            ) : (
              <SgWaitlistForm
                slots={allMatchingSlots.map((s) => ({
                  id: s.id,
                  name: s.name,
                  meeting_day: s.meeting_day,
                  meeting_time: s.meeting_time,
                  full: countForClass(s.id) >= s.capacity,
                }))}
                students={wlEligible}
                groupSizeType={groupSizeType}
                preSelectedIds={preSelectedWaitlistIds}
              />
            )}

            {wlIneligible.length > 0 && (
              <div className="mt-6 border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-500 mb-2">Not eligible for waitlist</h3>
                <ul className="space-y-1">
                  {wlIneligible.map((s) => (
                    <li key={s.id} className="text-sm text-slate-500">
                      <span className="font-medium text-slate-700">{s.name}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      </div>
    );
  }

  // If SG and needs second slot, show slot picker
  if (needsSecondSlot) {
    const otherSlots = allMatchingSlots.filter((s) => s.id !== classId && s.meeting_day !== slot1.meeting_day);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Choose Your Slots</h1>
          <p className="text-slate-500">
            {groupLabel} — {formatPrice(getPriceForEnrollment(groupSizeType))}/mo
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500 mb-4">You need to select 2 weekly time slots.</p>

            <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-blue-50">
              <p className="text-sm font-medium text-navy-900">Slot 1: {slot1.name || slot1.meeting_day} — {slot1.meeting_day} at {formatTime(slot1.meeting_time)}</p>
            </div>

            <h3 className="text-sm font-medium text-slate-700 mb-2">Choose your second slot:</h3>
            <div className="space-y-2">
              {(otherSlots || []).map((s) => {
                const enrolled = countForClass(s.id);
                const full = enrolled >= s.capacity;
                return (
                  <Link
                    key={s.id}
                    href={`/enroll/${classId}?slot2=${s.id}`}
                    className={`border border-slate-200 rounded-lg p-4 block hover:bg-navy-50 transition-colors ${full ? 'opacity-50' : ''}`}
                  >
                    <p className="font-medium text-navy-900">{s.name || s.meeting_day}</p>
                    <p className="text-sm text-slate-600">{s.meeting_day} at {formatTime(s.meeting_time)}</p>
                    {full && <p className="text-xs text-error font-medium mt-1">Full</p>}
                  </Link>
                );
              })}
              {(!otherSlots || otherSlots.length === 0) && (
                <p className="text-slate-500 text-sm">No other slots available for this subject and level.</p>
              )}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">{groupSizeType === 'large' ? (slot1.name || groupLabel) : groupLabel}</h1>
        <p className="text-slate-500">
          {groupSizeType === 'large'
            ? groupLabel
            : slot2
              ? `${slot1.meeting_day} at ${formatTime(slot1.meeting_time)} & ${slot2.meeting_day} at ${formatTime(slot2.meeting_time)}`
              : `${slot1.meeting_day} at ${formatTime(slot1.meeting_time)}`}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
          {/* Class details card */}
          <div className="border border-slate-200 rounded-lg p-4 mb-6 space-y-2">
            <div className="text-sm text-slate-600">
              {groupSizeType === 'large' ? (
                <>
                  <p>{slot1.meeting_day} at {formatTime(slot1.meeting_time)}</p>
                  {slot1.meeting_day_2 && slot1.meeting_time_2 && (
                    <p>{slot1.meeting_day_2} at {formatTime(slot1.meeting_time_2)}</p>
                  )}
                  <p className="mt-1">{slot1Enrolled}/{slot1.capacity} enrolled</p>
                </>
              ) : (
                <>
                  <p>Slot 1: {slot1.meeting_day} at {formatTime(slot1.meeting_time)} — {slot1Enrolled}/{slot1.capacity} enrolled</p>
                  {slot2 && (
                    <p>Slot 2: {slot2.meeting_day} at {formatTime(slot2.meeting_time)} — {slot2Enrolled}/{slot2.capacity} enrolled</p>
                  )}
                </>
              )}
            </div>
            {slot1.group_size_type === 'large' && slot1.class_start_date && (
              <p className="text-sm text-slate-500">
                {slot1.class_start_date} to {slot1.class_end_date}
              </p>
            )}
            {slot1.group_size_type !== 'large' && (
              <p className="text-sm text-slate-500">
                {slot1.enrollment_window_start && slot1.enrollment_window_end
                  ? 'Choose your first session date below'
                  : 'Rolling enrollment — starts when you enroll'}
              </p>
            )}
            {anyFull && <p className="text-error text-sm font-medium">One or more slots are full</p>}
            <p className="text-lg font-bold text-navy-900 mt-2">{formatPrice(price)}/mo</p>
          </div>

          {anyFull ? (() => {
            // For waitlist, re-check eligibility skipping capacity (already know it's full)
            const wlStudents = students.filter((s) => {
              const ineligible = ineligibleStudents.find((i) => i.id === s.id);
              // Allow if only ineligible due to capacity
              if (!ineligible) return true;
              return /full|capacity/i.test(ineligible.reason);
            });

            return wlStudents.length === 0 ? (
              <div className="text-center py-8">
                {students.length === 0 ? (
                  <p className="text-slate-500 text-sm">
                    {profile?.role === 'parent' ? (
                      <>No students on your account.{' '}<a href="/parent/add-student" className="underline">Add a student</a> first.</>
                    ) : (
                      'Student profile not found. Please contact support.'
                    )}
                  </p>
                ) : (
                  <p className="text-slate-600">None of your students are eligible for the waitlist.</p>
                )}
              </div>
            ) : (groupSizeType === 'small' || groupSizeType === 'one_on_one') ? (
              <SgWaitlistForm
                slots={allMatchingSlots.map((s) => ({
                  id: s.id,
                  name: s.name,
                  meeting_day: s.meeting_day,
                  meeting_time: s.meeting_time,
                  full: countForClass(s.id) >= s.capacity,
                }))}
                students={wlStudents}
                groupSizeType={groupSizeType}
              />
            ) : (
              <WaitlistForm classId={classId} students={wlStudents} />
            );
          })() : eligibleStudents.length === 0 ? (
            <div className="text-center py-8">
              {students.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  {profile?.role === 'parent' ? (
                    <>No students on your account.{' '}<a href="/parent/add-student" className="underline">Add a student</a> first.</>
                  ) : (
                    'Student profile not found. Please contact support.'
                  )}
                </p>
              ) : (
                <p className="text-slate-600">None of your students are eligible for this class.</p>
              )}
            </div>
          ) : (
            <EnrollForm
              slot1ClassId={classId}
              slot2ClassId={slot2?.id || null}
              students={eligibleStudents}
              price={price}
              stripeEnabled={process.env.STRIPE_ENABLED === 'true'}
              groupSizeType={groupSizeType}
              slot1Label={groupSizeType === 'large' && slot1.meeting_day_2 && slot1.meeting_time_2
                ? `${slot1.meeting_day} at ${formatTime(slot1.meeting_time)} & ${slot1.meeting_day_2} at ${formatTime(slot1.meeting_time_2)}`
                : `${slot1.meeting_day} at ${formatTime(slot1.meeting_time)}`}
              slot2Label={slot2 ? `${slot2.meeting_day} at ${formatTime(slot2.meeting_time)}` : undefined}
              enrollmentWindowStart={slot1.enrollment_window_start || undefined}
              enrollmentWindowEnd={slot1.enrollment_window_end || undefined}
              slot1MeetingDay={slot1.meeting_day}
              slot2MeetingDay={slot2?.meeting_day}
            />
          )}

          {ineligibleStudents.length > 0 && (
            <div className="mt-6 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-500 mb-2">Not eligible for this class</h3>
              <ul className="space-y-1">
                {ineligibleStudents.map((s) => (
                  <li key={s.id} className="text-sm text-slate-500">
                    <span className="font-medium text-slate-700">{s.name}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </div>
  );
}
