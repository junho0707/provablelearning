import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { getPriceForEnrollment, formatTime } from '@/lib/constants';
import Link from 'next/link';
import AcceptOfferForm from './accept-form';

const stripeEnabled = process.env.STRIPE_ENABLED === 'true';


export default async function WaitlistOfferPage({
  params,
}: {
  params: Promise<{ waitlistId: string }>;
}) {
  const { waitlistId } = await params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: entry } = await supabase
    .from('waitlist')
    .select('*, classes(*)')
    .eq('id', waitlistId)
    .single();

  if (!entry) notFound();

  // Determine if this is an SG/1:1 entry (class_id is null, preferred_class_ids is set)
  const isSgEntry = !entry.class_id && entry.preferred_class_ids;

  // For SG/1:1 entries, fetch class info from preferred_class_ids
  let sgClasses: Array<Record<string, unknown>> = [];
  if (isSgEntry) {
    const { data } = await adminSupabase
      .from('classes')
      .select('id, name, subject, level, meeting_day, meeting_time, capacity, group_size_type')
      .in('id', entry.preferred_class_ids as string[]);
    sgClasses = (data || []) as Array<Record<string, unknown>>;
  }

  const cls = entry.classes as Record<string, unknown> | null;

  // Determine role-aware dashboard link
  const { data: { user } } = await supabase.auth.getUser();
  let dashboardPath = '/parent';
  if (user) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
    if (profile?.role === 'student') dashboardPath = '/student';
  }

  if (entry.status === 'converted') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">You&apos;re Enrolled!</h1>
          <p className="text-slate-500">You accepted the waitlist offer and are now enrolled.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {isSgEntry ? (
            <div className="border border-slate-200 rounded-lg p-4 mb-6">
              <h2 className="font-medium text-navy-900">Enrollment</h2>
              <p className="text-xs text-slate-500 mt-1">Your preferred slots were used for enrollment.</p>
            </div>
          ) : cls ? (
            <div className="border border-slate-200 rounded-lg p-4 mb-6">
              <h2 className="font-medium text-navy-900">{cls.name as string}</h2>
              {(!!cls.subject || !!cls.level) && (
                <p className="text-sm text-slate-600 mt-1">
                  {cls.subject ? (cls.subject as string).replace('_', ' ') : ''}{cls.level ? ` — ${cls.level as string}` : ''}
                </p>
              )}
              <p className="text-sm text-slate-500 mt-1">
                {cls.meeting_day as string} at {formatTime(cls.meeting_time as string)}
              </p>
            </div>
          ) : null}

          <div className="text-center">
            <Link
              href={dashboardPath}
              className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (entry.status === 'expired') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Offer Expired</h1>
          <p className="text-slate-500">This waitlist offer is no longer available.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-slate-600 mb-6">
            The spot has been offered to the next person in line.
            You may re-join the waitlist if spots are still available.
          </p>
          <Link
            href="/enroll"
            className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
          >
            Enroll
          </Link>
        </div>
      </div>
    );
  }

  // Status is 'notified' with offer_expires_at — show accept form for SG/1:1
  if (entry.status === 'notified' && isSgEntry && entry.offer_expires_at) {
    const expired = new Date(entry.offer_expires_at) < new Date();

    if (expired) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">Offer Expired</h1>
            <p className="text-slate-500">This waitlist offer is no longer available.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="text-slate-600 mb-6">
              The spot will be offered to the next person in line.
            </p>
            <Link
              href="/enroll"
              className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
            >
              Enroll
            </Link>
          </div>
        </div>
      );
    }

    // Check capacity for each preferred slot
    const { data: enrollmentRows } = await adminSupabase
      .from('enrollments')
      .select('slot_1_class_id, slot_2_class_id, slot_3_class_id, class_id')
      .in('status', ['pending', 'active']);

    function countForClass(targetId: string): number {
      let count = 0;
      (enrollmentRows || []).forEach((row: Record<string, unknown>) => {
        if (row.slot_1_class_id === targetId || row.slot_2_class_id === targetId || row.slot_3_class_id === targetId || row.class_id === targetId) count++;
      });
      return count;
    }

    const groupSizeType = (sgClasses[0]?.group_size_type as string) || 'small';
    const price = getPriceForEnrollment(groupSizeType);

    const slotInfos = sgClasses.map((sc) => ({
      id: sc.id as string,
      name: (sc.name as string) || (sc.meeting_day as string),
      meeting_day: sc.meeting_day as string,
      meeting_time: sc.meeting_time as string,
      hasCapacity: countForClass(sc.id as string) < (sc.capacity as number),
    }));

    return (
      <div className="space-y-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">A Spot Opened Up!</h1>
          <p className="text-slate-500">Choose your time slots and complete enrollment.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-500 mb-4">
            {groupSizeType === 'one_on_one' ? '1:1 Private' : 'Small Group'}
          </p>

          <AcceptOfferForm
            waitlistId={waitlistId}
            slots={slotInfos}
            price={price}
            offerExpiresAt={entry.offer_expires_at}
            stripeEnabled={stripeEnabled}
            groupSizeType={groupSizeType}
          />
        </div>
      </div>
    );
  }

  // Status is 'waiting' or 'notified' (LG) — still on waitlist
  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">On the Waitlist</h1>
        <p className="text-slate-500">
          {isSgEntry
            ? 'You will be notified when your preferred slots open up.'
            : 'You will be auto-enrolled when a seat opens.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {isSgEntry ? (
          <div className="border border-slate-200 rounded-lg p-4 mb-6">
            <h2 className="text-sm font-medium text-navy-900 mb-2">Your Preferred Slots</h2>
            {sgClasses.map((sc) => (
              <p key={sc.id as string} className="text-sm text-slate-600">
                {sc.name as string || sc.meeting_day as string} — {sc.meeting_day as string} at {formatTime(sc.meeting_time as string)}
              </p>
            ))}
          </div>
        ) : cls ? (
          <div className="border border-slate-200 rounded-lg p-4 mb-6">
            <h2 className="text-sm font-medium text-navy-900">{cls.name as string}</h2>
            {(!!cls.subject || !!cls.level) && (
              <p className="text-sm text-slate-600 mt-1">
                {cls.subject ? (cls.subject as string).replace('_', ' ') : ''}{cls.level ? ` — ${cls.level as string}` : ''}
              </p>
            )}
            <p className="text-sm text-slate-500 mt-1">
              {cls.meeting_day as string} at {formatTime(cls.meeting_time as string)}
            </p>
          </div>
        ) : null}

        <div className="text-center">
          <Link
            href={dashboardPath}
            className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
