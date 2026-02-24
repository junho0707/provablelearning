import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import { formatPrice, getPriceForGroupSize } from '@/lib/stripe/prices';
import type { GroupSizeType } from '@/lib/types';
import { checkEligibility } from '@/lib/enrollment/check-eligibility';
import EnrollForm from './enroll-form';
import WaitlistForm from './waitlist-form';

export default async function ClassEnrollPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('*, courses(*)')
    .eq('id', classId)
    .single();

  if (!cls) notFound();

  // Get current enrollment count
  const { count: enrolledCount } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('class_id', classId)
    .in('status', ['pending', 'active']);

  const isFull = (enrolledCount || 0) >= cls.capacity;
  const course = cls.courses as Record<string, unknown>;
  const price = getPriceForGroupSize(cls.group_size_type as GroupSizeType);

  // Get current user's students
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const adminSupabase = createAdminClient();
  let students: Array<{ id: string; user: { full_name: string } }> = [];

  function normalizeStudents(data: Record<string, unknown>[] | null) {
    return (data || []).map((s) => {
      const u = s.users as unknown as Record<string, string> | Record<string, string>[] | null;
      const name = Array.isArray(u) ? u[0]?.full_name : u?.full_name;
      // Fall back to full_name on the students table (independent students or pending)
      const studentName = name || (s.full_name as string) || 'Unknown';
      return { id: s.id as string, user: { full_name: studentName } };
    });
  }

  // Parents and independent students can enroll
  if (profile?.role !== 'parent' && profile?.role !== 'student') redirect(`/${profile?.role || ''}`);

  if (profile?.role === 'parent') {
    // Parent: fetch their children
    const { data } = await adminSupabase
      .from('students')
      .select('id, users!students_user_id_fkey(full_name)')
      .eq('parent_id', user.id);
    students = normalizeStudents(data as Record<string, unknown>[] | null);
  } else {
    // Student: fetch their own student record
    const { data } = await adminSupabase
      .from('students')
      .select('id, parent_id, users!students_user_id_fkey(full_name)')
      .eq('user_id', user.id);
    const allStudentRows = (data || []) as Record<string, unknown>[];

    // Check if this is a parent-linked student (parent manages enrollments)
    const isParentLinked = allStudentRows.length > 0 && allStudentRows[0].parent_id != null;
    if (isParentLinked) {
      return (
        <div className="max-w-lg">
          <h1 className="text-2xl font-bold mb-2">{course.name as string}</h1>
          <p className="text-gray-600 mb-6">
            {(course.subject as string).replace('_', ' ')} — {course.level as string}
          </p>
          <div className="border rounded-lg p-6 text-center">
            <p className="text-gray-600">
              Your parent manages your course enrollments. Please ask them to enroll you.
            </p>
          </div>
        </div>
      );
    }
    students = normalizeStudents(allStudentRows);
  }

  // Check eligibility for each student (catches time conflicts, class-blocked, re-enroll limits, etc.)
  const eligibleStudents: typeof students = [];
  const ineligibleStudents: Array<{ id: string; name: string; reason: string }> = [];

  for (const s of students) {
    const result = await checkEligibility(adminSupabase, s.id, classId, course.id as string);
    if (result.eligible) {
      eligibleStudents.push(s);
    } else {
      ineligibleStudents.push({ id: s.id, name: s.user.full_name, reason: result.reason || 'Not eligible' });
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-2">{course.name as string}</h1>
      <p className="text-gray-600 mb-1">
        {(course.subject as string).replace('_', ' ')} — {course.level as string}
      </p>
      <p className="text-gray-500 text-sm mb-4">
        {course.start_date as string} to {course.end_date as string}
      </p>

      <div className="border rounded-lg p-4 mb-6">
        <p className="font-medium">{cls.group_size_type.replace('_', ' ')} group</p>
        <p className="text-sm text-gray-600">
          {cls.meeting_day} at {cls.meeting_time}
        </p>
        <p className="text-sm">
          Seats: {enrolledCount || 0} / {cls.capacity}
          {isFull && <span className="text-red-600 ml-2 font-medium">FULL</span>}
        </p>
        <p className="text-lg font-bold mt-2">{formatPrice(price)}</p>
      </div>

      {eligibleStudents.length === 0 ? (
        <div className="text-center py-8">
          {students.length === 0 ? (
            <p className="text-gray-500 text-sm">
              {profile?.role === 'parent' ? (
                <>No students on your account.{' '}<a href="/parent/add-child" className="underline">Add a child</a> first.</>
              ) : (
                'Student profile not found. Please contact support.'
              )}
            </p>
          ) : (
            <p className="text-gray-600">None of your students are eligible for this class.</p>
          )}
        </div>
      ) : isFull ? (
        <WaitlistForm classId={classId} students={eligibleStudents} />
      ) : (
        <EnrollForm
          classId={classId}
          courseId={course.id as string}
          students={eligibleStudents}
          price={price}
          stripeEnabled={process.env.STRIPE_ENABLED === 'true'}
        />
      )}

      {ineligibleStudents.length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Not eligible for this class</h3>
          <ul className="space-y-1">
            {ineligibleStudents.map((s) => (
              <li key={s.id} className="text-sm text-gray-500">
                <span className="font-medium text-gray-700">{s.name}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
