import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminReplyForm } from './reply-form';

export default async function AdminMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get all messages sent to this admin
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .or(`to_user_id.eq.${user.id},from_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);

  // Group by conversation partner
  type Msg = NonNullable<typeof messages>[number];
  const conversations = new Map<string, Msg[]>();
  for (const msg of messages || []) {
    const partnerId = msg.from_user_id === user.id ? msg.to_user_id : msg.from_user_id;
    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, []);
    }
    conversations.get(partnerId)!.push(msg);
  }

  // Fetch user names for partners
  const partnerIds = Array.from(conversations.keys());
  let partnerNames: Record<string, string> = {};
  if (partnerIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', partnerIds);
    partnerNames = Object.fromEntries(
      (users || []).map((u) => [u.id, u.full_name])
    );
  }

  // Mark unread messages as read
  const unreadIds = (messages || [])
    .filter((m) => m.to_user_id === user.id && !m.read)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    await supabase
      .from('messages')
      .update({ read: true })
      .in('id', unreadIds);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Messages</h1>
        <p className="text-slate-500">Parent and student conversations.</p>
      </div>

      {conversations.size === 0 && (
        <p className="text-slate-500">No messages yet.</p>
      )}

      <div className="space-y-6">
        {Array.from(conversations.entries()).map(([partnerId, msgs]) => (
          <div key={partnerId} className="border border-slate-200 rounded-xl p-6">
            <h2 className="font-semibold mb-3">
              {partnerNames[partnerId] || 'Unknown Student'}
            </h2>

            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {[...msgs].reverse().map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded p-3 text-sm ${
                    msg.from_user_id === user.id
                      ? 'bg-blue-50 ml-4 sm:ml-8'
                      : 'bg-slate-50 mr-4 sm:mr-8'
                  }`}
                >
                  <p className="text-xs text-slate-400 mb-1">
                    {msg.from_user_id === user.id ? 'You' : partnerNames[partnerId] || 'Student'}{' '}
                    &middot; {new Date(msg.created_at).toLocaleString()}
                  </p>
                  <p>{msg.body}</p>
                </div>
              ))}
            </div>

            <AdminReplyForm toUserId={partnerId} />
          </div>
        ))}
      </div>
    </div>
  );
}
