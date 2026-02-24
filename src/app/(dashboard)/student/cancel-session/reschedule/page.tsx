import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RescheduleWidget } from '../../../_components/reschedule-widget';

export default async function StudentReschedulePage({
  searchParams,
}: {
  searchParams: Promise<{ cancellation_id?: string }>;
}) {
  const params = await searchParams;
  const cancellationId = params.cancellation_id;

  if (!cancellationId) redirect('/student/cancel-session');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Verify the cancellation exists (RLS handles ownership)
  const { data: cancellation } = await supabase
    .from('session_cancellations')
    .select('id, status, group_size_type')
    .eq('id', cancellationId)
    .single();

  if (!cancellation) redirect('/student/cancel-session');
  if (cancellation.status !== 'cancelled' || cancellation.group_size_type !== 'one_on_one') {
    redirect('/student/cancel-session');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Reschedule Session</h1>
      <p className="text-gray-500 mb-6">
        Pick a new time for your 1:1 session within the next 2 weeks.
      </p>
      <RescheduleWidget cancellationId={cancellationId} />
    </div>
  );
}
