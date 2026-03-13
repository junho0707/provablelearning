import Link from 'next/link';
import { getUserRole } from '@/lib/auth/get-user-role';

export default async function EnrollSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; paid_with_credits?: string; test_mode?: string; from?: string; conflicts?: string; pay_later?: string; deadline?: string }>;
}) {
  const { paid_with_credits, test_mode, from, conflicts, pay_later, deadline } = await searchParams;
  const isPayLater = from === 'pay_later' || pay_later === 'true';

  // Parse conflict dates if any
  const conflictDates = conflicts
    ? decodeURIComponent(conflicts).split(',').map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      })
    : [];

  const userInfo = await getUserRole();
  const dashboardHref = userInfo ? `/${userInfo.role}` : '/';

  const deadlineFormatted = deadline
    ? new Date(decodeURIComponent(deadline) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const title = isPayLater ? 'Enrollment Confirmed!' : 'Enrollment Successful!';
  const description = isPayLater
    ? deadlineFormatted
      ? `Your seat is reserved. Please pay by ${deadlineFormatted}.`
      : 'Your seat is reserved. Payment is due within 7 days of your start date.'
    : paid_with_credits
      ? 'Your credits have been applied.'
      : test_mode
        ? 'Your seat is reserved (test mode).'
        : 'Your payment has been received.';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy-900">{title}</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-slate-600 mb-6">
          {isPayLater
            ? `Your seat is reserved and your enrollment is active.${deadlineFormatted ? ` Payment is due by ${deadlineFormatted}.` : ' Payment is due within 7 days of your start date.'} You can pay anytime from your dashboard.`
            : paid_with_credits
              ? 'Your credits have been applied and your seat is reserved.'
              : test_mode
                ? 'Your seat is reserved (test mode — payment skipped).'
                : 'Your seat is reserved. You will receive a confirmation email shortly with your class details and schedule.'}
        </p>
        {conflictDates.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="font-medium text-amber-800 mb-2">Scheduling Notice</p>
            <p className="text-sm text-amber-700 mb-2">
              The following session{conflictDates.length > 1 ? 's have' : ' has'} a conflict with an existing makeup booking:
            </p>
            <ul className="text-sm text-amber-700 list-disc list-inside mb-2">
              {conflictDates.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
            <p className="text-sm text-amber-700">
              Credits have been issued for {conflictDates.length > 1 ? 'these sessions' : 'this session'}. Please use them to book alternate sessions from your dashboard.
            </p>
          </div>
        )}
        <Link
          href={dashboardHref}
          className="inline-block rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-navy-800 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
