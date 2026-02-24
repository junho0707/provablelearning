import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export default async function AdminClassesPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('*, courses(name, subject)')
    .order('created_at', { ascending: false });

  // Get enrollment counts per class
  const classIds = (classes || []).map((c: Record<string, unknown>) => c.id as string);
  const { data: enrollments } = classIds.length > 0
    ? await adminClient
        .from('enrollments')
        .select('class_id')
        .in('class_id', classIds)
        .in('status', ['active', 'pending'])
    : { data: [] };

  const enrollCountMap: Record<string, number> = {};
  for (const e of enrollments || []) {
    enrollCountMap[e.class_id] = (enrollCountMap[e.class_id] || 0) + 1;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Classes</h1>
        <Link
          href="/admin/classes/new"
          className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
        >
          New Class
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Course</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Enrolled</th>
              <th className="text-left px-4 py-3 font-medium">Schedule</th>
              <th className="text-left px-4 py-3 font-medium">Active</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {classes?.map((c: Record<string, unknown>) => {
              const enrolled = enrollCountMap[c.id as string] || 0;
              const capacity = c.capacity as number;
              return (
                <tr key={c.id as string}>
                  <td className="px-4 py-3">{(c.courses as Record<string, string>)?.name}</td>
                  <td className="px-4 py-3">{(c.group_size_type as string).replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <span className={enrolled >= capacity ? 'text-red-600 font-medium' : ''}>
                      {enrolled} / {capacity}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.meeting_day as string} {c.meeting_time as string}</td>
                  <td className="px-4 py-3">{(c.active as boolean) ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/classes/${c.id}`} className="text-blue-600 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!classes || classes.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No classes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
