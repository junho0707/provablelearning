import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Course } from '@/lib/types';

export default async function AdminCoursesPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from('courses')
    .select('*')
    .order('start_date', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link
          href="/admin/courses/new"
          className="rounded bg-black px-4 py-2 text-white text-sm font-medium hover:bg-gray-800"
        >
          New Course
        </Link>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Subject</th>
              <th className="text-left px-4 py-3 font-medium">Level</th>
              <th className="text-left px-4 py-3 font-medium">Dates</th>
              <th className="text-left px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(courses as Course[] | null)?.map((mod) => (
              <tr key={mod.id}>
                <td className="px-4 py-3">{mod.name}</td>
                <td className="px-4 py-3">{mod.subject.replace('_', ' ')}</td>
                <td className="px-4 py-3 capitalize">{mod.level}</td>
                <td className="px-4 py-3">
                  {mod.start_date} — {mod.end_date}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/courses/${mod.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {(!courses || courses.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No courses yet. Create your first course.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
