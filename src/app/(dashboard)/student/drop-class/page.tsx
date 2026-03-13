import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DropClassForm } from './drop-class-form';
import { NoteDropForm } from './note-drop-form';
import { PHASE_1_DAYS_BEFORE_START } from '@/lib/constants';

interface EnrollmentRow {
  id: string;
  student_id: string;
  class_id: string;
  status: string;
  payment_status: string;
  slot_1_class_id: string | null;
  slot_2_class_id: string | null;
  student_start_date: string | null;
  student_end_date: string | null;
  classes: {
    name: string;
    subject: string | null;
    level: string | null;
    meeting_day: string;
    meeting_time: string;
    group_size_type: string;
    class_start_date: string;
    class_end_date: string;
  };
}

function getDropPhase(
  startDate: string,
  today: Date
): 1 | 2 | 3 {
  const start = new Date(startDate + 'T00:00:00');
  const diffMs = start.getTime() - today.getTime();
  const daysUntilStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilStart > PHASE_1_DAYS_BEFORE_START) return 1;

  const daysSinceStart = Math.floor(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceStart <= 7) return 2;

  return 3;
}

export default async function StudentDropClassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  // Get own student record
  const { data: student } = await adminClient
    .from('students')
    .select('id, users!students_user_id_fkey(full_name)')
    .eq('user_id', user.id)
    .single();

  if (!student) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Drop a Class</h1>
          <p className="text-slate-500">Review and drop your active enrollments.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-500">Student profile not found.</p>
        </div>
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

  // Get active enrollments
  const { data } = await supabase
    .from('enrollments')
    .select(
      'id, student_id, class_id, status, payment_status, slot_1_class_id, slot_2_class_id, student_start_date, student_end_date, classes!class_id(name, subject, level, meeting_day, meeting_time, group_size_type, class_start_date, class_end_date)'
    )
    .eq('student_id', studentId)
    .eq('status', 'active');
  const enrollments = (data || []) as unknown as EnrollmentRow[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const enriched = enrollments.map((e) => {
    const effectiveStartDate = e.student_start_date || e.classes.class_start_date;
    const effectiveEndDate = e.student_end_date || e.classes.class_end_date;
    const startDate = new Date(effectiveStartDate + 'T00:00:00');
    const diffMs = startDate.getTime() - today.getTime();
    const daysUntilStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const dropPhase = getDropPhase(effectiveStartDate, today);
    const isPaid = e.payment_status === 'paid';
    return { ...e, daysUntilStart, dropPhase, isPaid, effectiveStartDate, effectiveEndDate };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Drop a Class</h1>
        <p className="text-slate-500">Review and drop your active enrollments.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {enriched.length === 0 ? (
            <p className="text-slate-500">No active enrollments to drop.</p>
          ) : (
            <div className="space-y-3">
              {enriched.map((e) => (
                <div key={e.id} className="border border-slate-200 rounded-lg p-4">
                  <p className="font-medium text-navy-900">{e.classes.name}</p>
                  <p className="text-sm text-slate-600 mt-1">
                    {e.classes.subject ? e.classes.subject.replace('_', ' ') : ''}{e.classes.level ? ` — ${e.classes.level}` : ''}
                  </p>
                  <div className="mt-2 text-sm text-slate-500 space-y-0.5">
                    <p>
                      Schedule: {e.classes.meeting_day} at {e.classes.meeting_time}
                    </p>
                    <p>
                      Group: {e.classes.group_size_type.replace('_', ' ')}
                    </p>
                    <p>
                      Dates: {e.effectiveStartDate} to {e.effectiveEndDate}
                    </p>
                    <p className="text-xs text-slate-400">
                      {e.daysUntilStart > 0
                        ? `Starts in ${e.daysUntilStart} day${e.daysUntilStart !== 1 ? 's' : ''}`
                        : 'In progress'}
                    </p>
                  </div>

                  <div className="mt-4">
                    {e.isPaid ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-800">
                          This enrollment has been paid. To drop or request a
                          refund, please{' '}
                          <Link
                            href={`/book?student=${encodeURIComponent(studentName)}&class=${encodeURIComponent(e.classes.name)}&enrollment=${e.id}`}
                            className="underline font-medium hover:text-amber-900"
                          >
                            schedule a refund consultation
                          </Link>
                          .
                        </p>
                      </div>
                    ) : (
                      <>
                        {e.dropPhase === 1 && (
                          <DropClassForm enrollmentId={e.id} />
                        )}
                        {e.dropPhase === 2 && (
                          <NoteDropForm enrollmentId={e.id} />
                        )}
                        {e.dropPhase === 3 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800">
                              This class is past the early-drop window. To request a
                              refund, please{' '}
                              <Link
                                href={`/book?student=${encodeURIComponent(studentName)}&class=${encodeURIComponent(e.classes.name)}&enrollment=${e.id}`}
                                className="underline font-medium hover:text-amber-900"
                              >
                                schedule a refund consultation
                              </Link>
                              .
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
