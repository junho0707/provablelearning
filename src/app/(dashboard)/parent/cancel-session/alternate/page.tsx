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

export default async function ParentAlternatePage({ searchParams }: Props) {
  const params = await searchParams;
  const cancellationId = params.cancellation_id;

  if (!cancellationId) {
    redirect('/parent/cancel-session');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Verify this cancellation belongs to one of the parent's children
  const adminClient = createAdminClient();

  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, status, group_size_type, session_number, session_date, course_id, class_id')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) {
    redirect('/parent/cancel-session');
  }

  // Check ownership: student must be child of this parent
  const { data: student } = await adminClient
    .from('students')
    .select('id, parent_id')
    .eq('id', cancellation.student_id)
    .single();

  if (!student || student.parent_id !== user.id) {
    redirect('/parent/cancel-session');
  }

  // Must be in cancelled status and not one_on_one
  if (cancellation.status !== 'cancelled' || cancellation.group_size_type === 'one_on_one') {
    redirect('/parent/cancel-session');
  }

  // Fetch related info separately (avoid nested joins that can fail silently)
  const [{ data: courseRow }, { data: classRow }, { data: userRow }] = await Promise.all([
    cancellation.course_id
      ? adminClient.from('courses').select('name').eq('id', cancellation.course_id).single()
      : Promise.resolve({ data: null }),
    cancellation.class_id
      ? adminClient.from('classes').select('meeting_day, meeting_time').eq('id', cancellation.class_id).single()
      : Promise.resolve({ data: null }),
    adminClient
      .from('students')
      .select('user_id')
      .eq('id', cancellation.student_id)
      .single()
      .then(async ({ data: s }) => {
        if (!s) return { data: null };
        return adminClient.from('users').select('full_name').eq('id', s.user_id).single();
      }),
  ]);

  const courseName = courseRow?.name;
  const clsInfo = classRow;
  const studentName = userRow?.full_name;

  const cancelledContext = {
    studentName: studentName || 'Student',
    courseName: courseName || 'Course',
    sessionNumber: cancellation.session_number as number,
    sessionDate: cancellation.session_date as string,
    meetingDay: (clsInfo?.meeting_day as string) || '',
    meetingTime: (clsInfo?.meeting_time as string) || '',
  };

  // Branch by group size type:
  // - large → existing alternate session flow (join another regular class)
  // - small/medium → dedicated makeup sessions
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
          basePath="/parent/cancel-session"
          cancelledContext={cancelledContext}
        />
      </div>
    );
  }

  // Small/medium → dedicated makeup sessions
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
        basePath="/parent/cancel-session"
        cancelledContext={cancelledContext}
      />
    </div>
  );
}
