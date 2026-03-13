import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { findAlternateSessions } from '@/lib/cancellation/find-alternate-sessions';
import { AlternateSessionPicker } from '../../../_components/alternate-session-picker';

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

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

  // Verify this cancellation belongs to one of the parent's students
  const adminClient = createAdminClient();

  const { data: cancellation } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, status, group_size_type, session_number, session_date, class_id')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) {
    redirect('/parent/cancel-session');
  }

  // Check ownership: student must belong to this parent
  const { data: student } = await adminClient
    .from('students')
    .select('id, parent_id')
    .eq('id', cancellation.student_id)
    .single();

  if (!student || student.parent_id !== user.id) {
    redirect('/parent/cancel-session');
  }

  // Must be in cancelled status
  if (cancellation.status !== 'cancelled') {
    redirect('/parent/cancel-session');
  }

  // Fetch class info and student name separately (avoid nested joins that can fail silently)
  const [{ data: classRow }, { data: userRow }] = await Promise.all([
    cancellation.class_id
      ? adminClient.from('classes').select('name, subject, level, meeting_day, meeting_time').eq('id', cancellation.class_id).single()
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

  const cancelledContext = {
    studentName: userRow?.full_name || 'Student',
    courseName: classRow?.name || 'Class',
    sessionNumber: cancellation.session_number as number,
    sessionDate: cancellation.session_date as string,
    meetingDay: (classRow?.meeting_day as string) || '',
    meetingTime: (classRow?.meeting_time as string) || '',
  };

  // Fetch initial week (week of cancelled session)
  const result = await findAlternateSessions(cancellationId, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Find Alternate Session</h1>
        <p className="text-slate-500">Pick a makeup slot for your cancelled session. Browse weeks using the arrows.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="border border-slate-200 rounded-lg p-4 mb-6 text-sm">
          <p className="font-medium text-navy-900">{cancelledContext.studentName} — {cancelledContext.courseName}</p>
          <p className="text-slate-500">
            Cancelled: Session {cancelledContext.sessionNumber} on {cancelledContext.sessionDate} ({cancelledContext.meetingDay} at {formatTime(cancelledContext.meetingTime)})
          </p>
        </div>
        <AlternateSessionPicker
          cancellationId={cancellationId}
          initialSessions={result.sessions || []}
          initialWeekStart={result.weekStart || ''}
          initialWeekEnd={result.weekEnd || ''}
          windowStart={result.windowStart || ''}
          windowEnd={result.windowEnd}
          basePath="/parent/cancel-session"
          cancelledContext={cancelledContext}
        />
      </div>
    </div>
  );
}
