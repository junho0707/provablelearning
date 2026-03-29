import { BookingWidget } from './booking-widget';
import { ServerNav } from '@/components/server-nav';
import { getNavProps } from '@/lib/auth/get-nav-props';

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    student?: string;
    class?: string;
    enrollment?: string;
  }>;
}) {
  const params = await searchParams;
  const studentName = params.student || '';
  const className = params.class || '';
  const bookingType = params.enrollment ? 'refund' as const : 'initial' as const;

  const navProps = await getNavProps();

  return (
    <main className="min-h-screen bg-navy-50">
      <ServerNav {...navProps} />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy-900">Book a Consultation Meeting</h1>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <BookingWidget
            studentName={studentName}
            className={className}
            bookingType={bookingType}
          />
        </div>
      </div>
    </main>
  );
}
