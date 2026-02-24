import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import EditClassForm from './edit-form';
import { DeleteClassButton } from './delete-button';

interface EnrollmentWithStudent {
  id: string;
  status: string;
  created_at: string;
  students: {
    id: string;
    grade_level: number | null;
    users: { full_name: string };
  };
}

interface WaitlistEntry {
  id: string;
  status: string;
  created_at: string;
  notified_at: string | null;
  students: {
    id: string;
    users: { full_name: string };
  };
}

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: cls } = await supabase
    .from('classes')
    .select('*, courses(id, name, subject)')
    .eq('id', id)
    .single();

  if (!cls) notFound();

  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, subject')
    .order('start_date', { ascending: false });

  // Fetch enrolled students
  const { data: enrollments } = await adminClient
    .from('enrollments')
    .select(
      'id, status, created_at, students(id, grade_level, users!students_user_id_fkey(full_name))'
    )
    .eq('class_id', id)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: true });

  const roster = (enrollments || []) as unknown as EnrollmentWithStudent[];

  // Fetch waitlist
  const { data: waitlistData } = await adminClient
    .from('waitlist')
    .select(
      'id, status, created_at, notified_at, students(id, users!students_user_id_fkey(full_name))'
    )
    .eq('class_id', id)
    .in('status', ['waiting', 'notified'])
    .order('created_at', { ascending: true });

  const waitlist = (waitlistData || []) as unknown as WaitlistEntry[];

  const course = cls.courses as Record<string, string>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Class Details</h1>
        <Link
          href="/admin/classes"
          className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Classes
        </Link>
      </div>

      {/* Class info summary */}
      <div className="border rounded-lg p-4 mb-6 bg-gray-50">
        <p className="font-semibold text-lg">{course?.name}</p>
        <p className="text-sm text-gray-600">
          {(cls.group_size_type as string).replace('_', ' ')} group —{' '}
          {cls.meeting_day} at {cls.meeting_time}
        </p>
        <p className="text-sm text-gray-500">
          Enrolled: {roster.length} / {cls.capacity}
          {roster.length >= (cls.capacity as number) && (
            <span className="text-red-600 ml-2 font-medium">FULL</span>
          )}
        </p>
      </div>

      {/* Enrolled students roster */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Enrolled Students ({roster.length})
        </h2>
        {roster.length === 0 ? (
          <p className="text-gray-500 text-sm">No students enrolled yet.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Grade</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roster.map((e, i) => {
                  const student = e.students;
                  const userObj = student?.users as unknown as
                    | { full_name: string }
                    | { full_name: string }[];
                  const name = Array.isArray(userObj)
                    ? userObj[0]?.full_name
                    : userObj?.full_name;
                  return (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">
                        {name || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        {student?.grade_level || 'N/A'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            e.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waitlist */}
      {waitlist.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Waitlist ({waitlist.length})
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">#</th>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {waitlist.map((w, i) => {
                  const student = w.students;
                  const userObj = student?.users as unknown as
                    | { full_name: string }
                    | { full_name: string }[];
                  const name = Array.isArray(userObj)
                    ? userObj[0]?.full_name
                    : userObj?.full_name;
                  return (
                    <tr key={w.id}>
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">
                        {name || 'Unknown'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            w.status === 'notified'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit form */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Edit Class</h2>
        <EditClassForm cls={cls} courses={courses || []} />
      </div>

      {/* Delete */}
      <div className="border-t pt-6 mt-6">
        <DeleteClassButton classId={id} />
      </div>
    </div>
  );
}
