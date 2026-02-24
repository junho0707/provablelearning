import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditMakeupSessionForm from './edit-form';
import { DeleteMakeupSessionButton } from './delete-button';

export default async function MakeupSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: session } = await supabase
    .from('makeup_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (!session) notFound();

  // Fetch booked students
  const { data: bookings } = await adminClient
    .from('makeup_bookings')
    .select('id, student_id, session_date, status, created_at')
    .eq('makeup_session_id', id)
    .in('status', ['booked', 'attended'])
    .order('created_at', { ascending: true });

  // Resolve student names
  const studentIds = (bookings || []).map((b) => b.student_id);
  let studentNameMap: Record<string, string> = {};
  if (studentIds.length > 0) {
    const { data: studentRows } = await adminClient
      .from('students')
      .select('id, users!students_user_id_fkey(full_name)')
      .in('id', studentIds);

    for (const s of studentRows || []) {
      const userObj = (s as Record<string, unknown>).users as unknown as
        | Record<string, string>
        | Record<string, string>[];
      const name = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
      studentNameMap[s.id] = name || 'Unknown';
    }
  }

  // Fetch waitlist entries
  const { data: waitlistEntries } = await adminClient
    .from('makeup_waitlist')
    .select('id, student_id, status, created_at')
    .eq('makeup_session_id', id)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  const wlStudentIds = (waitlistEntries || []).map((w) => w.student_id);
  if (wlStudentIds.length > 0) {
    const { data: wlStudentRows } = await adminClient
      .from('students')
      .select('id, users!students_user_id_fkey(full_name)')
      .in('id', wlStudentIds);

    for (const s of wlStudentRows || []) {
      const userObj = (s as Record<string, unknown>).users as unknown as
        | Record<string, string>
        | Record<string, string>[];
      const name = Array.isArray(userObj) ? userObj[0]?.full_name : userObj?.full_name;
      studentNameMap[s.id] = name || 'Unknown';
    }
  }

  const formatSubject = (s: string) => s === 'digital_rw' ? 'SAT RW' : s === 'digital_math' ? 'SAT Math' : s;
  const formatLevel = (l: string) => l.charAt(0).toUpperCase() + l.slice(1);
  const bookedCount = (bookings || []).length;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Makeup Session Details</h1>
        <Link
          href="/admin/makeup-sessions"
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Makeup Sessions
        </Link>
      </div>

      {/* Session info summary */}
      <div className="border rounded-lg p-4 mb-6 bg-gray-50">
        <p className="font-semibold text-lg">
          {formatSubject(session.subject)} — {formatLevel(session.level)}
        </p>
        <p className="text-sm text-gray-600">
          {session.session_date} at {session.session_time}
        </p>
        {session.location && (
          <p className="text-sm text-gray-500">{session.location}</p>
        )}
        <p className="text-sm text-gray-500">
          Booked: {bookedCount} / {session.capacity}
          {bookedCount >= session.capacity && (
            <span className="text-red-600 ml-2 font-medium">FULL</span>
          )}
        </p>
      </div>

      {/* Booked students */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Booked Students ({bookedCount})</h2>
        {bookedCount === 0 ? (
          <p className="text-gray-500 text-sm">No students booked yet.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Booked</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(bookings || []).map((b, i) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{studentNameMap[b.student_id] || 'Unknown'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        b.status === 'attended' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(b.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waitlist */}
      {(waitlistEntries || []).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Waitlist ({waitlistEntries!.length})</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {waitlistEntries!.map((w, i) => (
                  <tr key={w.id}>
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{studentNameMap[w.student_id] || 'Unknown'}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(w.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit form */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Edit Makeup Session</h2>
        <EditMakeupSessionForm session={session} />
      </div>

      {/* Delete */}
      <div className="border-t pt-6 mt-6">
        <DeleteMakeupSessionButton sessionId={id} />
      </div>
    </div>
  );
}
