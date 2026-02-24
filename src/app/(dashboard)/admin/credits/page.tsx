import { createClient } from '@/lib/supabase/server';

const GROUP_SIZE_LABELS: Record<string, string> = {
  one_on_one: '1-on-1',
  small: 'Small',
  medium: 'Medium',
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
    <div>
      <h1 className="text-2xl font-bold mb-2">Credits</h1>
      <p className="text-sm text-gray-500 mb-6">
        Credits are issued automatically when a student cancels a session and the
        end-of-week deadline passes (small, medium, and 1-on-1 groups). Credits are
        also restored automatically when an enrollment fails or a Stripe session expires.
      </p>

      <h2 className="text-lg font-semibold mb-4">Credit History</h2>
      {!credits?.length ? (
        <p className="text-gray-500 text-sm">No credits have been issued yet.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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
