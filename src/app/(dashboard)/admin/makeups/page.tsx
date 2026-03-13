import { createAdminClient } from '@/lib/supabase/admin';
import { formatTime } from '@/lib/constants';
import { MakeupReviewForm } from './review-form';

export default async function AdminMakeupPage() {
  const adminClient = createAdminClient();

  // Fetch pending makeup requests
  const { data: requests } = await adminClient
    .from('admin_logs')
    .select('id, admin_id, metadata_json, created_at')
    .eq('action', 'student_makeup_request')
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch review decisions to pair with requests
  const { data: reviews } = await adminClient
    .from('admin_logs')
    .select('metadata_json')
    .eq('action', 'makeup_request_reviewed')
    .limit(200);

  const reviewedIds = new Set(
    (reviews || []).map((r) => (r.metadata_json as Record<string, unknown>).original_log_id)
  );

  const pendingRequests = (requests || []).filter((r) => {
    const meta = r.metadata_json as Record<string, unknown>;
    return meta.status === 'pending_review' && !reviewedIds.has(r.id);
  });

  const reviewedRequests = (requests || []).filter((r) => reviewedIds.has(r.id));

  // Fetch makeup bookings (alternate sessions — host_class_id IS NOT NULL)
  const { data: makeupBookings } = await adminClient
    .from('makeup_bookings')
    .select('id, student_id, host_class_id, session_number, session_date, status, created_at')
    .not('host_class_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch 1:1 reschedules (from session_cancellations with rescheduled status)
  const { data: reschedules } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, class_id, session_number, session_date, status, rescheduled_to, group_size_type')
    .eq('status', 'rescheduled')
    .eq('group_size_type', 'one_on_one')
    .order('rescheduled_to', { ascending: false })
    .limit(50);

  // Collect all student/class IDs for batch resolution
  const allStudentIds = new Set<string>();
  const allClassIds = new Set<string>();

  (requests || []).forEach((r) => {
    const meta = r.metadata_json as Record<string, string>;
    if (meta.student_id) allStudentIds.add(meta.student_id);
    if (meta.class_id) allClassIds.add(meta.class_id);
  });
  (makeupBookings || []).forEach((mb) => {
    allStudentIds.add(mb.student_id);
    if (mb.host_class_id) allClassIds.add(mb.host_class_id);
  });
  (reschedules || []).forEach((r) => {
    allStudentIds.add(r.student_id);
    if (r.class_id) allClassIds.add(r.class_id);
  });

  const studentIdArr = [...allStudentIds];
  const classIdArr = [...allClassIds];

  const [{ data: studentRows }, { data: classRows }] = await Promise.all([
    studentIdArr.length > 0
      ? adminClient
          .from('students')
          .select('id, users!students_user_id_fkey(full_name)')
          .in('id', studentIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    classIdArr.length > 0
      ? adminClient.from('classes').select('id, name, meeting_day, meeting_time, subject, level, group_size_type, google_meet_link').in('id', classIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const studentNameMap = new Map<string, string>();
  (studentRows || []).forEach((s: Record<string, unknown>) => {
    const userObj = s.users as unknown as Record<string, string> | Record<string, string>[];
    const name = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
    studentNameMap.set(s.id as string, name || 'Unknown');
  });

  const classInfoMap = new Map<string, { name: string; day: string; time: string; subject: string | null; level: string | null; groupSize: string; meetLink: string | null }>();
  (classRows || []).forEach((c: Record<string, unknown>) => {
    classInfoMap.set(c.id as string, {
      name: (c.name as string) || 'Unnamed',
      day: (c.meeting_day as string) || '',
      time: (c.meeting_time as string) || '',
      subject: (c.subject as string) || null,
      level: (c.level as string) || null,
      groupSize: (c.group_size_type as string) || '',
      meetLink: (c.google_meet_link as string) || null,
    });
  });

  const formatSubject = (s: string | null) => !s ? '' : s === 'digital_rw' ? 'Digital SAT RW' : s === 'digital_math' ? 'Digital SAT Math' : s === 'digital_rw_math' ? 'Digital SAT R&W + Math' : s;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Makeups</h1>
        <p className="text-slate-500">Reschedules, alternate sessions, and makeup requests.</p>
      </div>

      {/* 1:1 Reschedules */}
      <h2 className="text-lg font-semibold text-navy-900 mb-4">1:1 Reschedules ({(reschedules || []).length})</h2>
      {(!reschedules || reschedules.length === 0) ? (
        <p className="text-slate-500 mb-8">No 1:1 reschedules.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {reschedules.map((r) => {
            const studentName = studentNameMap.get(r.student_id) || 'Unknown';
            const classInfo = r.class_id ? classInfoMap.get(r.class_id) : null;
            const rescheduledDate = r.rescheduled_to
              ? new Date(r.rescheduled_to).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : '';
            const rescheduledTime = r.rescheduled_to
              ? new Date(r.rescheduled_to).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
              : '';

            return (
              <div key={r.id} className="flex flex-col gap-2 border rounded px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div>
                  <span className="font-medium">{studentName}</span>
                  {classInfo && <span className="text-slate-500 ml-2">{classInfo.name}</span>}
                  <span className="text-slate-400 ml-2">
                    Session {r.session_number} — originally {r.session_date}
                  </span>
                  {rescheduledDate && (
                    <span className="text-blue-600 ml-2">
                      → {rescheduledDate} at {rescheduledTime}
                    </span>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  rescheduled
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Makeup Bookings (alternate sessions) */}
      <h2 className="text-lg font-semibold text-navy-900 mb-4">Makeup Bookings ({(makeupBookings || []).length})</h2>
      {(!makeupBookings || makeupBookings.length === 0) ? (
        <p className="text-slate-500 mb-8">No makeup bookings.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {makeupBookings.map((mb) => {
            const studentName = studentNameMap.get(mb.student_id) || 'Unknown';
            const classInfo = mb.host_class_id ? classInfoMap.get(mb.host_class_id) : null;

            const statusColor =
              mb.status === 'attended' ? 'bg-green-100 text-green-800'
              : mb.status === 'no_show' ? 'bg-red-100 text-red-800'
              : mb.status === 'cancelled' ? 'bg-gray-100 text-slate-600'
              : 'bg-blue-100 text-blue-800';

            return (
              <div key={mb.id} className="flex flex-col gap-2 border rounded px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div>
                  <span className="font-medium">{studentName}</span>
                  {classInfo && (
                    <span className="text-slate-500 ml-2">
                      {classInfo.name}{classInfo.subject ? ` — ${formatSubject(classInfo.subject)}` : ''}{classInfo.level ? ` ${classInfo.level}` : ''}
                    </span>
                  )}
                  <span className="text-slate-400 ml-2">
                    Session {mb.session_number} — {mb.session_date}
                  </span>
                  {classInfo && (
                    <span className="text-slate-400 ml-2">
                      {classInfo.day} {formatTime(classInfo.time)}
                    </span>
                  )}
                  {classInfo?.meetLink && (
                    <a
                      href={classInfo.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline ml-2"
                      title="Copy this link to share with the student"
                    >
                      Meet link
                    </a>
                  )}
                </div>
                <span className={`capitalize text-xs px-2 py-0.5 rounded ${statusColor}`}>
                  {mb.status.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold text-navy-900 mb-4">Pending Review ({pendingRequests.length})</h2>
      {pendingRequests.length === 0 ? (
        <p className="text-slate-500 mb-8">No pending makeup requests.</p>
      ) : (
        <div className="space-y-4 mb-8">
          {pendingRequests.map((req) => {
            const meta = req.metadata_json as Record<string, string>;
            const studentName = studentNameMap.get(meta.student_id) || '';
            const classInfo = meta.class_id ? classInfoMap.get(meta.class_id) : null;
            return (
              <div key={req.id} className="border border-slate-200 rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    {(studentName || classInfo) && (
                      <p className="font-medium text-sm mb-1">
                        {studentName}{studentName && classInfo ? ' — ' : ''}{classInfo?.name || ''}
                      </p>
                    )}
                    <p className="font-medium">Session {meta.session_number}</p>
                    <p className="text-sm text-slate-600">Group: {meta.group_size_type}</p>
                    <p className="text-sm text-slate-600">Reason: {meta.reason}</p>
                    {meta.note_to_admin && (
                      <p className="text-sm text-amber-600 mt-1">{meta.note_to_admin}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </div>
                <MakeupReviewForm logId={req.id} />
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold text-navy-900 mb-4">Recently Reviewed ({reviewedRequests.length})</h2>
      {reviewedRequests.length === 0 ? (
        <p className="text-slate-500">No reviewed requests.</p>
      ) : (
        <div className="space-y-2">
          {reviewedRequests.map((req) => {
            const meta = req.metadata_json as Record<string, string>;
            const studentName = studentNameMap.get(meta.student_id) || '';
            const classInfo = meta.class_id ? classInfoMap.get(meta.class_id) : null;
            const review = (reviews || []).find(
              (r) => (r.metadata_json as Record<string, unknown>).original_log_id === req.id
            );
            const reviewMeta = review?.metadata_json as Record<string, string> | undefined;
            return (
              <div key={req.id} className="border rounded p-3 bg-slate-50">
                <p className="text-sm">
                  {studentName && <span className="font-medium">{studentName}</span>}
                  {studentName && ' — '}
                  {classInfo && <span>{classInfo.name} — </span>}
                  Session {meta.session_number} — {meta.group_size_type} —{' '}
                  <span className={reviewMeta?.decision === 'approved' ? 'text-green-600' : 'text-error'}>
                    {reviewMeta?.decision || 'reviewed'}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
