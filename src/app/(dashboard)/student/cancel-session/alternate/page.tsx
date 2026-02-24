import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAlternateSessions } from '@/lib/cancellation/find-alternate-sessions';
import { findDedicatedMakeupSessions } from '@/lib/cancellation/find-dedicated-makeups';
import { AlternateSessionPicker } from '../../../_components/alternate-session-picker';
import { DedicatedMakeupPicker } from '../../../_components/dedicated-makeup-picker';

interface Props {
  searchParams: Promise<{ cancellation_id?: string }>;
}

export default async function StudentAlternatePage({ searchParams }: Props) {
  const params = await searchParams;
  const cancellationId = params.cancellation_id;

  if (!cancellationId) {
    redirect('/student/cancel-session');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, status, group_size_type, session_number, session_date, course_id, class_id')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) {
    redirect('/student/cancel-session');
  }

  // Check ownership: student must be the logged-in user
  const { data: student } = await adminClient
    .from('students')
    .select('id, user_id, parent_id')
    .eq('id', cancellation.student_id)
    .single();

  if (!student || (student.user_id !== user.id && student.parent_id !== user.id)) {
    redirect('/student/cancel-session');
  }

  // Must be in cancelled status and not one_on_one
  if (cancellation.status !== 'cancelled' || cancellation.group_size_type === 'one_on_one') {
    redirect('/student/cancel-session');
  }

  // Fetch related info separately (avoid nested joins that can fail silently)
  const [{ data: courseRow }, { data: classRow }] = await Promise.all([
    cancellation.course_id
      ? adminClient.from('courses').select('name').eq('id', cancellation.course_id).single()
      : Promise.resolve({ data: null }),
    cancellation.class_id
      ? adminClient.from('classes').select('meeting_day, meeting_time').eq('id', cancellation.class_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Get student name from users table
  let studentName = 'Student';
  if (student.user_id) {
    const { data: userRow } = await adminClient.from('users').select('full_name').eq('id', student.user_id).single();
    if (userRow?.full_name) studentName = userRow.full_name;
  }

  const cancelledContext = {
    studentName,
    courseName: courseRow?.name || 'Course',
    sessionNumber: cancellation.session_number as number,
    sessionDate: cancellation.session_date as string,
    meetingDay: (classRow?.meeting_day as string) || '',
    meetingTime: (classRow?.meeting_time as string) || '',
  };

  const isLarge = cancellation.group_size_type === 'large';

  if (isLarge) {
    const result = await findAlternateSessions(cancellationId);

    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Find Alternate Session</h1>
        <div className="mb-6 bg-gray-50 border rounded-lg p-4 text-sm">
          <p className="font-medium">{cancelledContext.studentName} — {cancelledContext.courseName}</p>
          <p className="text-gray-500">
            Cancelled: Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate} ({cancelledContext.meetingDay} at {cancelledContext.meetingTime})
          </p>
        </div>
        <AlternateSessionPicker
          cancellationId={cancellationId}
          alternateSessions={result.sessions || []}
          basePath="/student/cancel-session"
          cancelledContext={cancelledContext}
        />
      </div>
    );
  }

  // Small/medium -> dedicated makeup sessions
  const dedicatedResult = await findDedicatedMakeupSessions(cancellationId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Find Makeup Session</h1>
      <div className="mb-6 bg-gray-50 border rounded-lg p-4 text-sm">
        <p className="font-medium">{cancelledContext.studentName} — {cancelledContext.courseName}</p>
        <p className="text-gray-500">
          Cancelled: Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate} ({cancelledContext.meetingDay} at {cancelledContext.meetingTime})
        </p>
      </div>
      <DedicatedMakeupPicker
        cancellationId={cancellationId}
        sessions={dedicatedResult.sessions || []}
        basePath="/student/cancel-session"
        cancelledContext={cancelledContext}
      />
    </div>
  );
}
