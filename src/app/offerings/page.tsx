import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatPrice, getPriceForGroupSize } from '@/lib/stripe/prices';
import type { GroupSizeType } from '@/lib/types';

export const revalidate = 60; // ISR: revalidate every 60s

export default async function OfferingsPage() {
  const supabase = await createClient();

  const { data: courses } = await supabase
    .from('courses')
    .select('*, classes(*)')
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  // Count enrolled students per class
  const classIds = (courses || []).flatMap(
    (m: Record<string, unknown>) =>
      ((m.classes as Array<Record<string, unknown>>) || []).map((c) => c.id as string)
  );

  let enrollmentCounts: Record<string, number> = {};
  if (classIds.length > 0) {
    const { data: counts } = await supabase
      .from('enrollments')
      .select('class_id')
      .in('class_id', classIds)
      .in('status', ['active', 'pending']);

    enrollmentCounts = (counts || []).reduce<Record<string, number>>((acc, row) => {
      acc[row.class_id] = (acc[row.class_id] || 0) + 1;
      return acc;
    }, {});
  }

  return (
    <main className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b">
        <Link href="/" className="font-bold text-lg">
          ProvableLearning
        </Link>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-black px-3 py-2"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
          >
            Sign Up
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Upcoming Courses</h1>
        <p className="text-gray-600 mb-8">
          Browse available SAT prep courses. Sign up or log in to enroll.
        </p>

        {(!courses || courses.length === 0) && (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-gray-500 mb-2">No upcoming courses available right now.</p>
            <p className="text-sm text-gray-400">Check back soon for new offerings.</p>
          </div>
        )}

        <div className="space-y-8">
          {courses?.map((mod: Record<string, unknown>) => {
            const classes = (mod.classes as Array<Record<string, unknown>>) || [];
            const activeClasses = classes.filter((c) => c.active);

            return (
              <div key={mod.id as string} className="border rounded-lg p-6">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold">{mod.name as string}</h2>
                  <p className="text-sm text-gray-600">
                    {(mod.subject as string).replace('_', ' ')} &mdash; {mod.level as string}
                  </p>
                  <p className="text-sm text-gray-500">
                    {mod.start_date as string} to {mod.end_date as string}
                  </p>
                </div>

                {activeClasses.length === 0 ? (
                  <p className="text-sm text-gray-400">No open classes for this course.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeClasses.map((cls) => {
                      const groupSize = cls.group_size_type as GroupSizeType;
                      const capacity = cls.capacity as number;
                      const enrolled = enrollmentCounts[cls.id as string] || 0;
                      const seatsLeft = capacity - enrolled;

                      return (
                        <div
                          key={cls.id as string}
                          className="border rounded p-4"
                        >
                          <p className="font-medium capitalize">
                            {groupSize.replace('_', ' ')} group
                          </p>
                          <p className="text-sm text-gray-600">
                            {cls.meeting_day as string} at {cls.meeting_time as string}
                          </p>
                          <p className="text-sm font-semibold mt-1">
                            {formatPrice(getPriceForGroupSize(groupSize))}
                          </p>
                          <p className={`text-xs mt-1 ${seatsLeft <= 2 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                            {seatsLeft > 0
                              ? `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`
                              : 'Full — join waitlist'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">Ready to enroll?</p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/login"
              className="rounded-md bg-black px-6 py-3 text-white font-medium hover:bg-gray-800"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-black px-6 py-3 font-medium hover:bg-gray-50"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
