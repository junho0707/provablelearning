import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DropClassForm } from './drop-class-form';
import { NoteDropForm } from './note-drop-form';
import { computeSessionDates } from '@/lib/scheduling/session-dates';

interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  course_id: string;
  status: string;
  classes: {
    meeting_day: string;
    meeting_time: string;
    group_size_type: string;
  };
  courses: {
    name: string;
    subject: string;
    level: string;
    start_date: string;
    end_date: string;
  };
}

function getDropPhase(
  startDate: string,
  meetingDay: string,
  today: Date
): 1 | 2 | 3 {
  const start = new Date(startDate + 'T00:00:00');
  const diffMs = start.getTime() - today.getTime();
  const daysUntilStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilStart > 7) return 1;

  // Compute first session date
  const sessions = computeSessionDates(startDate, meetingDay, 1);
  if (sessions.length === 0) return 3;

  const firstSession = sessions[0].date;
  const daysSinceFirst = Math.floor(
    (today.getTime() - firstSession.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceFirst <= 7) return 2;

  return 3;
}

export default async function DropClassPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const { student: selectedStudentId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get children
  const { data: students } = await adminClient
    .from('students')
    .select('id, users!students_user_id_fkey(full_name)')
    .eq('parent_id', user.id);

  const studentList = (students || []).map((s: Record<string, unknown>) => {
    const userObj = s.users as unknown as
      | Record<string, string>
      | Record<string, string>[];
    const name = Array.isArray(userObj)
      ? userObj[0]?.full_name
      : userObj?.full_name;
    return { id: s.id as string, name: name || 'Student' };
  });

  // Get active enrollments for selected student
  let enrollments: EnrollmentRow[] = [];
  if (selectedStudentId) {
    const { data } = await supabase
      .from('enrollments')
      .select(
        'id, student_id, class_id, course_id, status, classes(meeting_day, meeting_time, group_size_type), courses(name, subject, level, start_date, end_date)'
      )
      .eq('student_id', selectedStudentId)
      .eq('status', 'active');
    enrollments = (data || []) as unknown as EnrollmentRow[];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = enrollments.map((e) => {
    const startDate = new Date(e.courses.start_date + 'T00:00:00');
    const diffMs = startDate.getTime() - today.getTime();
    const daysUntilStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const dropPhase = getDropPhase(
      e.courses.start_date,
      e.classes.meeting_day,
      today
    );
    return { ...e, daysUntilStart, dropPhase };
  });

  const selectedStudent = studentList.find((s) => s.id === selectedStudentId);

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Drop a Class</h1>
        <Link
          href="/parent"
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Step 1: Select student */}
      {studentList.length === 0 ? (
        <p className="text-gray-500">No children on your account.</p>
      ) : (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select a student
          </label>
          <div className="flex flex-wrap gap-2">
            {studentList.map((s) => (
              <Link
                key={s.id}
                href={`/parent/drop-class?student=${s.id}`}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  selectedStudentId === s.id
                    ? 'bg-black text-white border-black'
                    : 'hover:bg-gray-50'
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Show enrollments for selected student */}
      {selectedStudentId && (
        <>
          {enriched.length === 0 ? (
            <p className="text-gray-500">
              {selectedStudent?.name || 'This student'} has no active
              enrollments.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Showing active enrollments for{' '}
                <span className="font-medium">{selectedStudent?.name}</span>
              </p>
              {enriched.map((e) => (
                <div key={e.id} className="border rounded-lg p-5">
                  <p className="font-semibold text-lg">{e.courses.name}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {e.courses.subject.replace('_', ' ')} —{' '}
                    {e.courses.level}
                  </p>
                  <div className="mt-2 text-sm text-gray-500 space-y-0.5">
                    <p>
                      Schedule: {e.classes.meeting_day} at{' '}
                      {e.classes.meeting_time}
                    </p>
                    <p>
                      Group: {e.classes.group_size_type.replace('_', ' ')}
                    </p>
                    <p>
                      Dates: {e.courses.start_date} to {e.courses.end_date}
                    </p>
                    <p className="text-xs text-gray-400">
                      {e.daysUntilStart > 0
                        ? `Starts in ${e.daysUntilStart} day${e.daysUntilStart !== 1 ? 's' : ''}`
                        : 'In progress'}
                    </p>
                  </div>

                  <div className="mt-4">
                    {e.dropPhase === 1 && (
                      <DropClassForm enrollmentId={e.id} />
                    )}
                    {e.dropPhase === 2 && (
                      <NoteDropForm enrollmentId={e.id} />
                    )}
                    {e.dropPhase === 3 && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-3">
                        <p className="text-sm text-amber-800">
                          This class is past the early-drop window. To request a
                          refund, please{' '}
                          <Link
                            href={`/book?student=${encodeURIComponent(selectedStudent?.name || '')}&class=${encodeURIComponent(e.courses.name)}&enrollment=${e.id}`}
                            className="underline font-medium hover:text-amber-900"
                          >
                            schedule a refund consultation
                          </Link>
                          .
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
