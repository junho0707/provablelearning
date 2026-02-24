import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MakeupReviewForm } from './review-form';

export default async function AdminMakeupPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Fetch pending makeup requests
  const { data: requests } = await supabase
    .from('admin_logs')
    .select('id, admin_id, metadata_json, created_at')
    .eq('action', 'student_makeup_request')
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch review decisions to pair with requests
  const { data: reviews } = await supabase
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

  // Fetch group makeup bookings (alternate sessions — host_class_id IS NOT NULL)
  const { data: makeupBookings } = await adminClient
    .from('makeup_bookings')
    .select('id, student_id, host_class_id, host_course_id, session_number, session_date, status, created_at')
    .not('host_class_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch dedicated makeup bookings (makeup_session_id IS NOT NULL)
  const { data: dedicatedBookings } = await adminClient
    .from('makeup_bookings')
    .select('id, student_id, makeup_session_id, session_number, session_date, status, created_at')
    .not('makeup_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch 1:1 reschedules (from session_cancellations with rescheduled status)
  const { data: reschedules } = await adminClient
    .from('session_cancellations')
    .select('id, student_id, course_id, session_number, session_date, status, rescheduled_to, group_size_type')
    .eq('status', 'rescheduled')
    .eq('group_size_type', 'one_on_one')
    .order('rescheduled_to', { ascending: false })
    .limit(50);

  // Collect all student/course/class/makeup_session IDs for batch resolution
  const allStudentIds = new Set<string>();
  const allCourseIds = new Set<string>();
  const allClassIds = new Set<string>();
  const allMakeupSessionIds = new Set<string>();

  (requests || []).forEach((r) => {
    const meta = r.metadata_json as Record<string, string>;
    if (meta.student_id) allStudentIds.add(meta.student_id);
    if (meta.course_id) allCourseIds.add(meta.course_id);
  });
  (makeupBookings || []).forEach((mb) => {
    allStudentIds.add(mb.student_id);
    allCourseIds.add(mb.host_course_id);
    allClassIds.add(mb.host_class_id);
  });
  (dedicatedBookings || []).forEach((db) => {
    allStudentIds.add(db.student_id);
    if (db.makeup_session_id) allMakeupSessionIds.add(db.makeup_session_id);
  });
  (reschedules || []).forEach((r) => {
    allStudentIds.add(r.student_id);
    if (r.course_id) allCourseIds.add(r.course_id);
  });

  const studentIdArr = [...allStudentIds];
  const courseIdArr = [...allCourseIds];
  const classIdArr = [...allClassIds];

  const makeupSessionIdArr = [...allMakeupSessionIds];

  const [{ data: studentRows }, { data: courseRows }, { data: classRows }, { data: makeupSessionRows }] = await Promise.all([
    studentIdArr.length > 0
      ? adminClient
          .from('students')
          .select('id, users!students_user_id_fkey(full_name)')
          .in('id', studentIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    courseIdArr.length > 0
      ? adminClient.from('courses').select('id, name').in('id', courseIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    classIdArr.length > 0
      ? adminClient.from('classes').select('id, meeting_day, meeting_time').in('id', classIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    makeupSessionIdArr.length > 0
      ? adminClient.from('makeup_sessions').select('id, subject, level, group_size_type, session_date, session_time, location').in('id', makeupSessionIdArr)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const studentNameMap = new Map<string, string>();
  (studentRows || []).forEach((s: Record<string, unknown>) => {
    const userObj = s.users as unknown as Record<string, string> | Record<string, string>[];
    const name = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
    studentNameMap.set(s.id as string, name || 'Unknown');
  });

  const courseNameMap = new Map<string, string>();
  (courseRows || []).forEach((c: Record<string, unknown>) => {
    courseNameMap.set(c.id as string, (c.name as string) || 'Unknown');
  });

  const classInfoMap = new Map<string, { day: string; time: string }>();
  (classRows || []).forEach((c: Record<string, unknown>) => {
    classInfoMap.set(c.id as string, {
      day: (c.meeting_day as string) || '',
      time: (c.meeting_time as string) || '',
    });
  });

  const makeupSessionInfoMap = new Map<string, { subject: string; level: string; groupSize: string; date: string; time: string; location: string }>();
  (makeupSessionRows || []).forEach((ms: Record<string, unknown>) => {
    makeupSessionInfoMap.set(ms.id as string, {
      subject: (ms.subject as string) || '',
      level: (ms.level as string) || '',
      groupSize: (ms.group_size_type as string) || '',
      date: (ms.session_date as string) || '',
      time: (ms.session_time as string) || '',
      location: (ms.location as string) || '',
    });
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Makeups</h1>

      {/* 1:1 Reschedules */}
      <h2 className="text-lg font-semibold mb-4">1:1 Reschedules ({(reschedules || []).length})</h2>
      {(!reschedules || reschedules.length === 0) ? (
        <p className="text-gray-500 mb-8">No 1:1 reschedules.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {reschedules.map((r) => {
            const studentName = studentNameMap.get(r.student_id) || 'Unknown';
            const courseName = r.course_id ? courseNameMap.get(r.course_id) || '' : '';
            const rescheduledDate = r.rescheduled_to
              ? new Date(r.rescheduled_to).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : '';
            const rescheduledTime = r.rescheduled_to
              ? new Date(r.rescheduled_to).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
              : '';

            return (
              <div key={r.id} className="flex justify-between items-center border rounded px-4 py-3 text-sm">
                <div>
                  <span className="font-medium">{studentName}</span>
                  {courseName && <span className="text-gray-500 ml-2">{courseName}</span>}
                  <span className="text-gray-400 ml-2">
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

      {/* Group Makeup Bookings */}
      <h2 className="text-lg font-semibold mb-4">Group Makeup Bookings ({(makeupBookings || []).length})</h2>
      {(!makeupBookings || makeupBookings.length === 0) ? (
        <p className="text-gray-500 mb-8">No group makeup bookings.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {makeupBookings.map((mb) => {
            const studentName = studentNameMap.get(mb.student_id) || 'Unknown';
            const courseName = courseNameMap.get(mb.host_course_id) || '';
            const classInfo = classInfoMap.get(mb.host_class_id);

            const statusColor =
              mb.status === 'attended' ? 'bg-green-100 text-green-800'
              : mb.status === 'no_show' ? 'bg-red-100 text-red-800'
              : mb.status === 'cancelled' ? 'bg-gray-100 text-gray-600'
              : 'bg-blue-100 text-blue-800';

            return (
              <div key={mb.id} className="flex justify-between items-center border rounded px-4 py-3 text-sm">
                <div>
                  <span className="font-medium">{studentName}</span>
                  {courseName && <span className="text-gray-500 ml-2">{courseName}</span>}
                  <span className="text-gray-400 ml-2">
                    Session {mb.session_number} — {mb.session_date}
                  </span>
                  {classInfo && (
                    <span className="text-gray-400 ml-2">
                      {classInfo.day} {classInfo.time}
                    </span>
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

      {/* Dedicated Makeup Bookings */}
      <h2 className="text-lg font-semibold mb-4">Dedicated Makeup Bookings ({(dedicatedBookings || []).length})</h2>
      {(!dedicatedBookings || dedicatedBookings.length === 0) ? (
        <p className="text-gray-500 mb-8">No dedicated makeup bookings.</p>
      ) : (
        <div className="space-y-2 mb-8">
          {dedicatedBookings.map((db) => {
            const studentName = studentNameMap.get(db.student_id) || 'Unknown';
            const msInfo = db.makeup_session_id ? makeupSessionInfoMap.get(db.makeup_session_id) : null;
            const formatSubject = (s: string) => s === 'digital_rw' ? 'SAT RW' : s === 'digital_math' ? 'SAT Math' : s;

            const statusColor =
              db.status === 'attended' ? 'bg-green-100 text-green-800'
              : db.status === 'no_show' ? 'bg-red-100 text-red-800'
              : db.status === 'cancelled' ? 'bg-gray-100 text-gray-600'
              : 'bg-blue-100 text-blue-800';

            return (
              <div key={db.id} className="flex justify-between items-center border rounded px-4 py-3 text-sm">
                <div>
                  <span className="font-medium">{studentName}</span>
                  {msInfo && (
                    <span className="text-gray-500 ml-2">
                      {formatSubject(msInfo.subject)} {msInfo.level}
                      <span className="capitalize"> ({msInfo.groupSize})</span>
                    </span>
                  )}
                  <span className="text-gray-400 ml-2">
                    {db.session_date}
                  </span>
                  {msInfo && (
                    <span className="text-gray-400 ml-2">
                      at {msInfo.time}
                    </span>
                  )}
                  {msInfo?.location && (
                    <span className="text-gray-400 ml-2">({msInfo.location})</span>
                  )}
                </div>
                <span className={`capitalize text-xs px-2 py-0.5 rounded ${statusColor}`}>
                  {db.status.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Pending Review ({pendingRequests.length})</h2>
      {pendingRequests.length === 0 ? (
        <p className="text-gray-500 mb-8">No pending makeup requests.</p>
      ) : (
        <div className="space-y-4 mb-8">
          {pendingRequests.map((req) => {
            const meta = req.metadata_json as Record<string, string>;
            const studentName = studentNameMap.get(meta.student_id) || '';
            const courseName = courseNameMap.get(meta.course_id) || '';
            return (
              <div key={req.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    {(studentName || courseName) && (
                      <p className="font-medium text-sm mb-1">
                        {studentName}{studentName && courseName ? ' — ' : ''}{courseName}
                      </p>
                    )}
                    <p className="font-medium">Session {meta.session_number}</p>
                    <p className="text-sm text-gray-600">Group: {meta.group_size_type}</p>
                    <p className="text-sm text-gray-600">Reason: {meta.reason}</p>
                    {meta.note_to_admin && (
                      <p className="text-sm text-amber-600 mt-1">{meta.note_to_admin}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </div>
                <MakeupReviewForm logId={req.id} />
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Recently Reviewed ({reviewedRequests.length})</h2>
      {reviewedRequests.length === 0 ? (
        <p className="text-gray-500">No reviewed requests.</p>
      ) : (
        <div className="space-y-2">
          {reviewedRequests.map((req) => {
            const meta = req.metadata_json as Record<string, string>;
            const studentName = studentNameMap.get(meta.student_id) || '';
            const courseName = courseNameMap.get(meta.course_id) || '';
            const review = (reviews || []).find(
              (r) => (r.metadata_json as Record<string, unknown>).original_log_id === req.id
            );
            const reviewMeta = review?.metadata_json as Record<string, string> | undefined;
            return (
              <div key={req.id} className="border rounded p-3 bg-gray-50">
                <p className="text-sm">
                  {studentName && <span className="font-medium">{studentName}</span>}
                  {studentName && ' — '}
                  {courseName && <span>{courseName} — </span>}
                  Session {meta.session_number} — {meta.group_size_type} —{' '}
                  <span className={reviewMeta?.decision === 'approved' ? 'text-green-600' : 'text-red-600'}>
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
