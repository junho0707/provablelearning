import Link from 'next/link';
import { getUserRole } from '@/lib/auth/get-user-role';

export default async function EnrollSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; paid_with_credits?: string; test_mode?: string }>;
}) {
  const { paid_with_credits, test_mode } = await searchParams;

  const userInfo = await getUserRole();
  const dashboardHref = userInfo ? `/${userInfo.role}` : '/';

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-2xl font-bold mb-4">Enrollment Successful!</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        {paid_with_credits
          ? 'Your credits have been applied and your seat is reserved.'
          : test_mode
            ? 'Your seat is reserved (test mode — payment skipped).'
            : 'Your payment has been received and your seat is reserved. You will receive a confirmation email shortly with your class details and schedule.'}
      </p>
      <Link
        href={dashboardHref}
        className="rounded bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
