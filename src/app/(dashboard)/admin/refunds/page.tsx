import { createClient } from '@/lib/supabase/server';
import RefundForm from './refund-form';

export default async function AdminRefundsPage() {
  const supabase = await createClient();

  // Get active enrollments that could be refunded
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(
      '*, students(user_id, users!students_user_id_fkey(full_name)), classes(group_size_type, courses(name))'
    )
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Refunds & Cancellations</h1>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Student</th>
              <th className="text-left px-4 py-3 font-medium">Course</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {enrollments?.map((e: Record<string, unknown>) => {
              const student = e.students as Record<string, unknown>;
              const cls = e.classes as Record<string, unknown>;
              const course = cls?.courses as Record<string, string>;
              const user = student?.users as Record<string, string>;

              return (
                <tr key={e.id as string}>
                  <td className="px-4 py-3">{user?.full_name || 'Unknown'}</td>
                  <td className="px-4 py-3">{course?.name || '—'}</td>
                  <td className="px-4 py-3">{(cls?.group_size_type as string)?.replace('_', ' ')}</td>
                  <td className="px-4 py-3 capitalize">{e.status as string}</td>
                  <td className="px-4 py-3">
                    <RefundForm
                      enrollmentId={e.id as string}
                      studentId={(student as Record<string, string>)?.user_id}
                      groupSizeType={cls?.group_size_type as string}
                      stripeSessionId={e.stripe_session_id as string | null}
                      creditsApplied={(e.credits_applied as number) || 0}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
