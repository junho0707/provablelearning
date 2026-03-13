import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { formatSubject, formatSchedule } from '@/lib/constants';

export default async function AdminClassesPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('*')
    .order('created_at', { ascending: false });

  // Get enrollment counts per class (slot-aware)
  const classIds = (classes || []).map((c: Record<string, unknown>) => c.id as string);
  const { data: enrollments } = classIds.length > 0
    ? await adminClient
        .from('enrollments')
        .select('id, slot_1_class_id, slot_2_class_id, slot_3_class_id, class_id')
        .in('status', ['active', 'pending'])
    : { data: [] };

  const enrollCountMap: Record<string, number> = {};
  for (const e of (enrollments || []) as Record<string, unknown>[]) {
    for (const cId of classIds) {
      if (e.slot_1_class_id === cId || e.slot_2_class_id === cId || e.slot_3_class_id === cId || e.class_id === cId) {
        enrollCountMap[cId] = (enrollCountMap[cId] || 0) + 1;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Classes</h1>
          <p className="text-slate-500">Manage class schedules and enrollments.</p>
        </div>
        <Link
          href="/admin/classes/new"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 transition-colors"
        >
          New Class
        </Link>
      </div>

      {(!classes || classes.length === 0) ? (
        <div className="border border-slate-200 rounded-xl px-4 py-8 text-center text-slate-500">
          No classes yet.
        </div>
      ) : (
        (() => {
          const groups: { key: string; label: string; color: string }[] = [
            { key: 'one_on_one', label: '1:1 Private', color: 'text-purple-700' },
            { key: 'small', label: 'Small Group', color: 'text-blue-700' },
            { key: 'large', label: 'Large Group', color: 'text-gray-700' },
          ];
          const grouped: Record<string, Record<string, unknown>[]> = {};
          for (const c of classes) {
            const key = c.group_size_type as string;
            (grouped[key] ??= []).push(c);
          }
          return groups
            .filter((g) => grouped[g.key]?.length)
            .map((g) => (
              <div key={g.key} className="mb-8">
                <h2 className={`text-lg font-semibold text-navy-900 mb-3 ${g.color}`}>{g.label}</h2>
                <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Class</th>
                        <th className="text-left px-4 py-3 font-medium">Subject</th>
                        <th className="text-left px-4 py-3 font-medium">Enrolled</th>
                        <th className="text-left px-4 py-3 font-medium">Schedule</th>
                        <th className="text-left px-4 py-3 font-medium">Active</th>
                        <th className="text-left px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {grouped[g.key]!.map((c: Record<string, unknown>) => {
                        const enrolled = enrollCountMap[c.id as string] || 0;
                        const capacity = c.capacity as number;
                        const level = c.level as string;
                        return (
                          <tr key={c.id as string}>
                            <td className="px-4 py-3 font-medium">{c.name as string}</td>
                            <td className="px-4 py-3">
                              {c.subject ? formatSubject(c.subject as string) : 'Subject-agnostic'}
                              {level && level !== 'all_levels' ? ` — ${level}` : ''}
                            </td>
                            <td className="px-4 py-3">
                              <span className={enrolled >= capacity ? 'text-error font-medium' : ''}>
                                {enrolled} / {capacity}
                              </span>
                            </td>
                            <td className="px-4 py-3">{formatSchedule(c as { meeting_day: string; meeting_time: string; meeting_day_2?: string | null; meeting_time_2?: string | null })}</td>
                            <td className="px-4 py-3">{(c.active as boolean) ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-3">
                              <Link href={`/admin/classes/${c.id}`} className="text-blue-600 hover:underline">
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ));
        })()
      )}
    </div>
  );
}
