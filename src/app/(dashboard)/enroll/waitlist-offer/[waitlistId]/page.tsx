import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function WaitlistOfferPage({
  params,
}: {
  params: Promise<{ waitlistId: string }>;
}) {
  const { waitlistId } = await params;
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from('waitlist')
    .select('*, classes(*, courses(name, subject, level))')
    .eq('id', waitlistId)
    .single();

  if (!entry) notFound();

  const cls = entry.classes as Record<string, unknown>;
  const course = cls.courses as Record<string, unknown>;

  if (entry.status === 'converted') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">You&apos;re Enrolled!</h1>
        <p className="text-gray-600 mb-6">
          A seat opened up and you were automatically enrolled in this class.
        </p>

        <div className="border rounded-lg p-4 mb-6 text-left">
          <h2 className="font-semibold">{course.name as string}</h2>
          <p className="text-sm text-gray-600">
            {(course.subject as string).replace('_', ' ')} — {course.level as string}
          </p>
          <p className="text-sm text-gray-500">
            {cls.meeting_day as string} at {cls.meeting_time as string}
          </p>
        </div>

        <Link
          href="/parent"
          className="rounded bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (entry.status === 'expired') {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h1 className="text-2xl font-bold mb-4">Waitlist Entry Expired</h1>
        <p className="text-gray-600 mb-8">
          This waitlist entry is no longer active. You may re-join the waitlist if spots are still available.
        </p>
        <Link href="/enroll" className="rounded bg-black px-6 py-3 text-white font-medium hover:bg-gray-800">
          Browse Courses
        </Link>
      </div>
    );
  }

  // Status is 'waiting' — still on waitlist
  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <h1 className="text-2xl font-bold mb-4">On the Waitlist</h1>
      <p className="text-gray-600 mb-6">
        You are on the waitlist for this class. When a seat opens, you will be automatically enrolled.
      </p>

      <div className="border rounded-lg p-4 mb-6 text-left">
        <h2 className="font-semibold">{course.name as string}</h2>
        <p className="text-sm text-gray-600">
          {(course.subject as string).replace('_', ' ')} — {course.level as string}
        </p>
        <p className="text-sm text-gray-500">
          {cls.meeting_day as string} at {cls.meeting_time as string}
        </p>
      </div>

      <Link
        href="/parent"
        className="rounded bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
