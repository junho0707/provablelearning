import { createClient } from '@/lib/supabase/server';
import LinkStudentForm from './link-form';

export default async function AdminStudentsPage() {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('students')
    .select('*, user:users!students_user_id_fkey(full_name, phone), parent:users!students_parent_id_fkey(full_name)')
    .order('created_at', { ascending: false });

  const { data: parents } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('role', 'parent')
    .order('full_name');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Students</h1>
        <p className="text-slate-500">View and manage student profiles.</p>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Student</th>
              <th className="text-left px-4 py-3 font-medium">Grade</th>
              <th className="text-left px-4 py-3 font-medium">Parent</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Link Parent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students?.map((s: Record<string, unknown>) => (
              <tr key={s.id as string}>
                <td className="px-4 py-3">{(s.user as Record<string, string>)?.full_name || 'Unknown'}</td>
                <td className="px-4 py-3">{(s.grade_level as number) || '—'}</td>
                <td className="px-4 py-3">{(s.parent as Record<string, string>)?.full_name || 'Independent'}</td>
                <td className="px-4 py-3 capitalize">{s.active_status as string}</td>
                <td className="px-4 py-3">
                  <LinkStudentForm
                    studentId={s.id as string}
                    currentParentId={s.parent_id as string | null}
                    parents={parents || []}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

  );
}
