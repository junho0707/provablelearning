import { createClient } from '@/lib/supabase/server';

const GROUP_SIZE_LABELS: Record<string, string> = {
  one_on_one: '1-on-1',
  small: 'Small',
  large: 'Large',
};

export default async function AdminCreditsPage() {
  const supabase = await createClient();

  const { data: credits } = await supabase
    .from('credits')
    .select('*, students(user_id, users!students_user_id_fkey(full_name))')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Credits</h1>
        <p className="text-slate-500">Makeup credits issued to students.</p>
      </div>

      {!credits?.length ? (
        <p className="text-slate-500 text-sm">No credits have been issued yet.</p>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Student</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Lessons</th>
                <th className="text-left px-4 py-3 font-medium">Remaining</th>
                <th className="text-left px-4 py-3 font-medium">Reason</th>
                <th className="text-left px-4 py-3 font-medium">Expires</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {credits.map((c: Record<string, unknown>) => (
                <tr key={c.id as string}>
                  <td className="px-4 py-3">
                    {((c.students as Record<string, unknown>)?.users as Record<string, string>)?.full_name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3">
                    {GROUP_SIZE_LABELS[c.group_size_type as string] || (c.group_size_type as string)}
                  </td>
                  <td className="px-4 py-3">{c.amount as number}</td>
                  <td className="px-4 py-3">{c.remaining_amount as number}</td>
                  <td className="px-4 py-3">{c.reason as string}</td>
                  <td className="px-4 py-3">{(c.expires_at as string) || '—'}</td>
                  <td className="px-4 py-3">{new Date(c.created_at as string).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
