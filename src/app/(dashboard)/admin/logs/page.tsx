import { createClient } from '@/lib/supabase/server';

export default async function AdminLogsPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from('admin_logs')
    .select('*, users!admin_logs_admin_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-left px-4 py-3 font-medium">Admin</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs?.map((log: Record<string, unknown>) => (
              <tr key={log.id as string}>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(log.created_at as string).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {(log.users as Record<string, string>)?.full_name || 'System'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{log.action as string}</td>
                <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                  {JSON.stringify(log.metadata_json)}
                </td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No audit log entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
