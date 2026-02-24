import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';

export default async function AdminMakeupSessionsPage() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: sessions } = await supabase
    .from('makeup_sessions')
    .select('*')
    .order('session_date', { ascending: true });

  // Get booked counts per session
  const sessionIds = (sessions || []).map((s: Record<string, unknown>) => s.id as string);
  const { data: bookings } = sessionIds.length > 0
    ? await adminClient
        .from('makeup_bookings')
        .select('makeup_session_id')
        .in('makeup_session_id', sessionIds)
        .eq('status', 'booked')
    : { data: [] };

  const bookedCountMap: Record<string, number> = {};
  for (const b of bookings || []) {
    const msId = b.makeup_session_id as string;
    bookedCountMap[msId] = (bookedCountMap[msId] || 0) + 1;
  }

  const formatSubject = (s: string) => s === 'digital_rw' ? 'SAT RW' : s === 'digital_math' ? 'SAT Math' : s;
  const formatLevel = (l: string) => l.charAt(0).toUpperCase() + l.slice(1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Makeup Sessions</h1>
        <Link
          href="/admin/makeup-sessions/new"
          className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
        >
          New Makeup Session
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Subject</th>
              <th className="text-left px-4 py-3 font-medium">Level</th>
              <th className="text-left px-4 py-3 font-medium">Group Size</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Time</th>
              <th className="text-left px-4 py-3 font-medium">Booked</th>
              <th className="text-left px-4 py-3 font-medium">Active</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sessions?.map((s: Record<string, unknown>) => {
              const booked = bookedCountMap[s.id as string] || 0;
              const capacity = s.capacity as number;
              return (
                <tr key={s.id as string}>
                  <td className="px-4 py-3">{formatSubject(s.subject as string)}</td>
                  <td className="px-4 py-3">{formatLevel(s.level as string)}</td>
                  <td className="px-4 py-3 capitalize">{s.group_size_type as string}</td>
                  <td className="px-4 py-3">{s.session_date as string}</td>
                  <td className="px-4 py-3">{s.session_time as string}</td>
                  <td className="px-4 py-3">
                    <span className={booked >= capacity ? 'text-red-600 font-medium' : ''}>
                      {booked} / {capacity}
                    </span>
                  </td>
                  <td className="px-4 py-3">{(s.active as boolean) ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/makeup-sessions/${s.id}`} className="text-blue-600 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!sessions || sessions.length === 0) && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No makeup sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
