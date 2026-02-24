import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatPrice, getPriceForGroupSize } from '@/lib/stripe/prices';
import type { GroupSizeType } from '@/lib/types';

export default async function EnrollPage() {
  const supabase = await createClient();

  // Parents and independent students can enroll
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent' && profile?.role !== 'student') redirect(`/${profile?.role || ''}`);

  // Fetch courses with their classes that haven't started yet
  const { data: courses } = await supabase
    .from('courses')
    .select('*, classes(*)')
    .gt('start_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Browse Available Courses</h1>

      {(!courses || courses.length === 0) && (
        <p className="text-gray-500">No upcoming courses available for enrollment.</p>
      )}

      <div className="space-y-6">
        {courses?.map((mod: Record<string, unknown>) => (
          <div key={mod.id as string} className="border rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold">{mod.name as string}</h2>
                <p className="text-sm text-gray-600">
                  {(mod.subject as string).replace('_', ' ')} — {mod.level as string}
                </p>
                <p className="text-sm text-gray-500">
                  {mod.start_date as string} to {mod.end_date as string}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(mod.classes as Array<Record<string, unknown>>)?.map((cls) => (
                <Link
                  key={cls.id as string}
                  href={`/enroll/${cls.id}`}
                  className="border rounded p-4 hover:bg-gray-50 block"
                >
                  <p className="font-medium">
                    {(cls.group_size_type as string).replace('_', ' ')} group
                  </p>
                  <p className="text-sm text-gray-600">
                    {cls.meeting_day as string} at {cls.meeting_time as string}
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {formatPrice(getPriceForGroupSize(cls.group_size_type as GroupSizeType))}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
