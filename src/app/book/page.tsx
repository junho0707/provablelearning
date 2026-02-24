import Link from 'next/link';
import { BookingWidget } from './booking-widget';

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
  const isRefundConsultation = !!studentName;

  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <Link href="/" className="font-bold text-lg">
          ProvableLearning
        </Link>
        <div className="flex gap-3">
          <Link
            href="/offerings"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            View Courses
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            Log In
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">
          {isRefundConsultation
            ? 'Request Refund Consultation'
            : 'Book a Consultation'}
        </h1>
        <p className="text-gray-600 mb-8">
          Pick a time that works for you. You&apos;ll receive a calendar invite
          with a Google Meet link.
        </p>
        <BookingWidget
          studentName={studentName}
          className={className}
        />
      </div>
    </main>
  );
}
