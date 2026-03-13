import { createClient } from '@/lib/supabase/server';

export default async function AdminLogsPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from('admin_logs')
    .select('*, users!admin_logs_admin_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Audit Log</h1>
        <p className="text-slate-500">System activity and admin action history.</p>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead className="bg-slate-50">
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
                <td className="px-4 py-3 text-slate-500">
                  {new Date(log.created_at as string).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {(log.users as Record<string, string>)?.full_name || 'System'}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{log.action as string}</td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                  {JSON.stringify(log.metadata_json)}
                </td>
              </tr>
            ))}
            {(!logs || logs.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
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
