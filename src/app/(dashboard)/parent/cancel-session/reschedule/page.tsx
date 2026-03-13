import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RescheduleWidget } from '../../../_components/reschedule-widget';

export default async function ParentReschedulePage({
  searchParams,
}: {
  searchParams: Promise<{ cancellation_id?: string }>;
}) {
  const params = await searchParams;
  const cancellationId = params.cancellation_id;

  if (!cancellationId) redirect('/parent/cancel-session');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Verify the cancellation exists and the parent owns it (RLS handles this)
  const { data: cancellation } = await supabase
    .from('session_cancellations')
    .select('id, status, group_size_type')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) redirect('/parent/cancel-session');
  if (cancellation.status !== 'cancelled' || cancellation.group_size_type !== 'one_on_one') {
    redirect('/parent/cancel-session');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Reschedule Session</h1>
        <p className="text-slate-500">Pick a new time for your 1:1 session within the next 2 weeks.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <RescheduleWidget cancellationId={cancellationId} />
      </div>
    </div>
  );
}
